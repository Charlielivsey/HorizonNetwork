import Foundation
import SwiftUI
import ServiceManagement

/// Everything the menu shows: signing in, setting up this Mac, and connecting.
@MainActor
final class VPNModel: ObservableObject {
    enum Stage { case signIn, pin, ready }

    @Published var stage: Stage = .signIn
    @Published var email = UserDefaults.standard.string(forKey: "email") ?? ""
    @Published var password = ""
    @Published var pin = ""
    @Published var busy = false
    @Published var error: String?
    @Published var user: User?
    @Published var deviceName: String?
    @Published var isSetUp = false
    @Published var connected = false
    @Published var ip: IPInfo?
    @Published var launchAtLogin = SMAppService.mainApp.status == .enabled

    private let api = API()
    private var flow = ""
    private var timer: Timer?

    init() {
        if let token = Keychain.get("token") {
            api.token = token
            stage = .ready
            Task { await refresh() }
        }
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let model = self else { return }
            Task { @MainActor in await model.checkStatus() }
        }
        Task { await checkStatus() }
    }

    var wireGuardInstalled: Bool { Paths.wireGuardInstalled }

    // MARK: Signing in

    func signIn() async {
        guard !busy else { return }
        error = nil; busy = true; defer { busy = false }
        do {
            let result = try await api.send("api/sign-in", method: "POST", body: ["email": email, "password": password], as: SignInResult.self)
            password = ""
            UserDefaults.standard.set(email, forKey: "email")
            if result.codeRequired == true, let flow = result.flow { self.flow = flow; pin = ""; stage = .pin; return }
            try await finishSignIn(result)
        } catch { self.error = error.localizedDescription }
    }

    func submitPin() async {
        guard !busy, pin.count == 6 else { return }
        error = nil; busy = true; defer { busy = false }
        do {
            let result = try await api.send("api/sign-in/code", method: "POST", body: ["flow": flow, "code": pin], as: SignInResult.self)
            try await finishSignIn(result)
        } catch let e as APIError {
            pin = ""; error = e.message
            if e.restart { stage = .signIn }
        } catch { pin = ""; self.error = error.localizedDescription }
    }

    func startAgain() { flow = ""; pin = ""; error = nil; stage = .signIn }

    private func finishSignIn(_ result: SignInResult) async throws {
        guard let token = result.token else { throw APIError(message: "Sign-in didn’t complete. Please try again.", status: 0) }
        api.token = token
        Keychain.set("token", token)
        user = result.user
        stage = .ready
        await refresh()
    }

    /// Signing out disconnects, removes this Mac from the VPN and forgets its key.
    func signOut() async {
        busy = true; defer { busy = false }
        if Paths.helperInstalled { _ = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "remove"]) }
        if let device = Keychain.get("deviceId") {
            _ = try? await api.send("api/devices/" + device, method: "DELETE", as: OKResponse.self)
        }
        _ = try? await api.send("api/sign-out", method: "POST", body: [:], as: OKResponse.self)
        for key in ["token", "deviceId", "privateKey"] { Keychain.set(key, nil) }
        api.token = nil; user = nil; isSetUp = false; deviceName = nil; connected = false; ip = nil
        stage = .signIn
    }

    // MARK: Status

    func refresh() async {
        do {
            let me = try await api.send("api/me", as: Me.self)
            user = me.user
            let deviceId = Keychain.get("deviceId")
            let device = me.devices.first { $0.id == deviceId }
            deviceName = device?.name
            if device == nil, deviceId != nil {
                // Removed on the website or by an administrator: this Mac needs setting up again.
                Keychain.set("deviceId", nil); Keychain.set("privateKey", nil)
                if Paths.helperInstalled { _ = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "remove"]) }
            }
            isSetUp = device != nil && Paths.helperInstalled && FileManager.default.fileExists(atPath: "/usr/local/etc/hn-vpn")
            await checkStatus()
        } catch let e as APIError where e.status == 401 {
            Keychain.set("token", nil); api.token = nil; stage = .signIn
            error = "Your sign-in has expired. Please sign in again."
        } catch { self.error = error.localizedDescription }
    }

    func checkStatus() async {
        guard Paths.helperInstalled else { connected = false; return }
        let result = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "status"])
        let now = result.output.trimmingCharacters(in: .whitespacesAndNewlines) == "up"
        if now != connected || ip == nil { connected = now; await checkIP() }
    }

    func checkIP() async {
        ip = try? await API().send("api/ip", as: IPInfo.self)
    }

    // MARK: Setting up this Mac

    /// Registers this Mac with its own key, then installs the helper and configuration (one password prompt).
    func setUp() async {
        guard !busy else { return }
        guard Paths.wireGuardInstalled else { error = "Install the WireGuard tools first."; return }
        error = nil; busy = true; defer { busy = false }
        do {
            let key = Keychain.get("privateKey").flatMap { DeviceKey(base64: $0) } ?? DeviceKey()
            let name = Host.current().localizedName ?? "Mac"
            if let old = Keychain.get("deviceId") {
                _ = try? await api.send("api/devices/" + old, method: "DELETE", as: OKResponse.self)
            }
            let created = try await api.send("api/devices", method: "POST", body: ["name": name, "publicKey": key.publicBase64], as: NewDevice.self)
            let config = created.connection.config.replacingOccurrences(of: "<this device’s private key>", with: key.privateBase64)
            try await install(config: config)
            Keychain.set("privateKey", key.privateBase64)
            Keychain.set("deviceId", created.device.id)
            deviceName = created.device.name
            isSetUp = true
        } catch { self.error = error.localizedDescription }
    }

    private func install(config: String) async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("hn-vpn-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: dir) }
        let conf = dir.appendingPathComponent("hn-vpn.conf"), helper = dir.appendingPathComponent("hn-vpn-ctl"), rule = dir.appendingPathComponent("sudoers")
        try config.write(to: conf, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: conf.path)
        guard let bundled = Bundle.main.url(forResource: "hn-vpn-ctl", withExtension: nil) else { throw APIError(message: "The app is missing its helper. Download it again.", status: 0) }
        try FileManager.default.copyItem(at: bundled, to: helper)
        // Lets this Mac user start and stop the VPN without a password, through the helper only.
        try "\(NSUserName()) ALL=(root) NOPASSWD: \(Paths.helper)\n".write(to: rule, atomically: true, encoding: .utf8)
        let q = Shell.quote
        let command = [
            "set -e",
            "/usr/sbin/visudo -cf \(q(rule.path)) >/dev/null",
            "mkdir -p /usr/local/libexec/hn-vpn /usr/local/etc/hn-vpn",
            "chown root:wheel /usr/local/libexec/hn-vpn /usr/local/etc/hn-vpn",
            "chmod 755 /usr/local/libexec/hn-vpn; chmod 700 /usr/local/etc/hn-vpn",
            "install -m 755 -o root -g wheel \(q(helper.path)) \(Paths.helper)",
            "install -m 600 -o root -g wheel \(q(conf.path)) \(Paths.config)",
            "install -m 440 -o root -g wheel \(q(rule.path)) \(Paths.sudoers)",
        ].joined(separator: "; ")
        let result = await Shell.runAsAdmin(command, prompt: "HN Group VPN needs to set up this Mac. This is only needed once.")
        if result.status != 0 {
            throw APIError(message: result.output.contains("User canceled") || result.output.contains("-128") ? "Setup was cancelled." : "Setup didn’t finish: " + result.output.trimmingCharacters(in: .whitespacesAndNewlines), status: 0)
        }
    }

    // MARK: Connecting

    func toggle() async {
        if connected { await disconnect() } else { await connect() }
    }

    func connect() async {
        guard !busy else { return }
        error = nil; busy = true; defer { busy = false }
        let result = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "up"])
        if result.status != 0 { error = "Couldn’t connect. " + lastLine(result.output) }
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        await checkStatus(); await checkIP()
    }

    func disconnect() async {
        guard !busy else { return }
        error = nil; busy = true; defer { busy = false }
        let result = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "down"])
        if result.status != 0 { error = "Couldn’t disconnect. " + lastLine(result.output) }
        await checkStatus(); await checkIP()
    }

    private func lastLine(_ text: String) -> String {
        text.split(separator: "\n").last.map(String.init) ?? ""
    }

    // MARK: Other

    func installWireGuard() {
        if let brew = Paths.homebrew {
            let script = "tell application \"Terminal\" to activate\ntell application \"Terminal\" to do script \"\(brew) install wireguard-tools\""
            NSAppleScript(source: script)?.executeAndReturnError(nil)
        } else {
            NSWorkspace.shared.open(URL(string: "https://brew.sh")!)
        }
    }

    func setLaunchAtLogin(_ on: Bool) {
        do { if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } } catch { self.error = error.localizedDescription }
        launchAtLogin = SMAppService.mainApp.status == .enabled
    }
}
