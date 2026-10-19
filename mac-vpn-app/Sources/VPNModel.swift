import Foundation
import SwiftUI
import ServiceManagement
import CryptoKit
import Security

/// Everything the menu shows: signing in, setting up this Mac, and connecting.
@MainActor
final class VPNModel: ObservableObject {
    enum Stage { case signIn, waiting, ready }
    enum Section: Hashable { case connection, ssh, profile, settings }
    /// The VPS's address inside the VPN. Only traffic to it goes through the tunnel (split tunnel).
    static let serverAddress = "10.88.0.1"
    /// Bumped when this Mac's WireGuard configuration must be fetched and installed again
    /// (2: split tunnel, only the server's traffic goes through the VPN).
    static let configVersion = "2"
    enum UpdateState: Equatable { case idle, checking, upToDate, downloading, installing, failed(String) }

    /// One model for the app, so links back from the browser reach it.
    static let shared = VPNModel()

    @Published var stage: Stage = .signIn
    @Published var busy = false
    @Published var error: String?
    @Published var user: User?
    @Published var deviceName: String?
    @Published var isSetUp = false
    @Published var connected = false
    @Published var ip: IPInfo?
    @Published var launchAtLogin = SMAppService.mainApp.status == .enabled
    @Published var section: Section = .connection
    @Published var avatar: NSImage?
    @Published var devices: [Device] = []
    @Published var profile: Profile?
    @Published var update: AppRelease?
    @Published var updateState: UpdateState = .idle
    @Published var helperOutdated = Paths.helperOutdated
    @Published var needsReconfigure = false
    /// Whether the server's SSH port answers through the VPN (nil while unknown).
    @Published var serverReachable: Bool?
    @Published var sshUser: String = UserDefaults.standard.string(forKey: "sshUser") ?? "root"
    @Published var sshBusy = false
    private var avatarTag: String?
    private var lastUpdateCheck = Date.distantPast

    private let api = API()
    private var timer: Timer?

    init() {
        if let token = Keychain.get("token") {
            api.token = token
            stage = .ready
            Task { await refresh() }
        }
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let model = self else { return }
            Task { @MainActor in
                await model.checkStatus()
                if Date().timeIntervalSince(model.lastUpdateCheck) > 6 * 3600 { await model.checkForUpdate(quietly: true) }
            }
        }
        Task { await checkStatus() }
    }

    var wireGuardInstalled: Bool { Paths.wireGuardInstalled }

    // MARK: Signing in

    /// Signing in happens on HN Group Auth in the browser. The app sends a challenge (a hash of a secret
    /// only it knows); after Auth, the browser opens hngroupvpn://signed-in?code=… and the app swaps
    /// the code and its secret for its own sign-in.
    func signIn() {
        error = nil
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let verifier = bytes.map { String(format: "%02x", $0) }.joined()
        let challenge = SHA256.hash(data: Data(verifier.utf8)).map { String(format: "%02x", $0) }.joined()
        Keychain.set("signInVerifier", verifier)
        var url = URLComponents(url: API.base.appendingPathComponent("auth/login"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "app", value: challenge)]
        if let address = url.url { NSWorkspace.shared.open(address) }
        stage = .waiting
    }

    func cancelSignIn() { Keychain.set("signInVerifier", nil); error = nil; stage = .signIn }

    /// Called with hngroupvpn://signed-in?code=… when Auth hands the sign-in back to the app.
    func completeSignIn(_ url: URL) async {
        guard url.scheme == "hngroupvpn", url.host == "signed-in",
              let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else { return }
        guard let verifier = Keychain.get("signInVerifier") else { error = "That sign-in wasn’t started from this Mac. Please sign in again."; stage = .signIn; return }
        error = nil; busy = true; defer { busy = false }
        do {
            let result = try await api.send("api/app/exchange", method: "POST", body: ["code": code, "verifier": verifier], as: SignInResult.self)
            Keychain.set("signInVerifier", nil)
            try await finishSignIn(result)
            NSApp.activate(ignoringOtherApps: true)
        } catch {
            Keychain.set("signInVerifier", nil)
            self.error = error.localizedDescription
            stage = .signIn
        }
    }

    private func finishSignIn(_ result: SignInResult) async throws {
        guard let token = result.token else { throw APIError(message: "Sign-in didn’t complete. Please try again.", status: 0) }
        api.token = token
        Keychain.set("token", token)
        user = result.user
        await loadAvatar(result.user)
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
        for key in ["token", "deviceId", "privateKey", "configVersion"] { Keychain.set(key, nil) }
        api.token = nil; user = nil; isSetUp = false; deviceName = nil; connected = false; ip = nil
        avatar = nil; avatarTag = nil; profile = nil; devices = []; update = nil; updateState = .idle; section = .connection
        stage = .signIn
    }

    // MARK: Status

    func refresh() async {
        do {
            let me = try await api.send("api/me", as: Me.self)
            user = me.user
            devices = me.devices
            await loadAvatar(me.user)
            if let release = me.macApp { noteRelease(release) }
            let deviceId = Keychain.get("deviceId")
            let device = me.devices.first { $0.id == deviceId }
            deviceName = device?.name
            if device == nil, deviceId != nil {
                // Removed on the website or by an administrator: this Mac needs setting up again.
                Keychain.set("deviceId", nil); Keychain.set("privateKey", nil)
                if Paths.helperInstalled { _ = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "remove"]) }
            }
            isSetUp = device != nil && Paths.helperInstalled && FileManager.default.fileExists(atPath: "/usr/local/etc/hn-vpn")
            helperOutdated = Paths.helperOutdated
            needsReconfigure = isSetUp && Keychain.get("configVersion") != VPNModel.configVersion
            if section == .profile { await loadProfile() }
            await checkStatus()
            if Date().timeIntervalSince(lastUpdateCheck) > 6 * 3600 { await checkForUpdate(quietly: true) }
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
        if connected { await checkServer() } else { serverReachable = nil }
    }

    /// Checks the server's SSH port answers through the VPN.
    func checkServer() async {
        let result = await Shell.run("/usr/bin/nc", ["-z", "-G", "3", "-w", "3", VPNModel.serverAddress, "22"])
        serverReachable = result.status == 0
    }

    /// Fetches this Mac's current VPN configuration and installs it (one password prompt), for
    /// example when the VPN moved to a split tunnel.
    func reconfigure() async {
        guard !busy, let deviceId = Keychain.get("deviceId"), let key = Keychain.get("privateKey") else { return }
        error = nil; busy = true; defer { busy = false }
        do {
            struct Wrapped: Decodable { let connection: Connection }
            let fresh = try await api.send("api/devices/" + deviceId + "/connection", as: Wrapped.self)
            let wasConnected = connected
            if wasConnected { _ = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "down"]) }
            try await install(config: fresh.connection.config.replacingOccurrences(of: "<this device’s private key>", with: key))
            Keychain.set("configVersion", VPNModel.configVersion)
            needsReconfigure = false
            if wasConnected { _ = await Shell.run("/usr/bin/sudo", ["-n", Paths.helper, "up"]) }
            await checkStatus()
        } catch { self.error = error.localizedDescription }
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
            Keychain.set("configVersion", VPNModel.configVersion)
            needsReconfigure = false
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
        let result = await Shell.runAsAdmin(command, prompt: "HN Secure Network needs to set up this Mac’s VPN connection.")
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

    // MARK: Profile

    /// The staff profile picture from HN Group Auth, fetched again only when it changes.
    private func loadAvatar(_ user: User?) async {
        guard let user = user else { return }
        guard let tag = user.avatar else { avatar = nil; avatarTag = nil; return }
        if tag == avatarTag, avatar != nil { return }
        if let data = await api.data("api/avatar"), let image = NSImage(data: data) { avatar = image; avatarTag = tag }
    }

    func loadProfile() async {
        do {
            let p = try await api.send("api/profile", as: Profile.self)
            profile = p; user = p.user; devices = p.devices
            await loadAvatar(p.user)
        } catch let e as APIError where e.status == 401 {
            Keychain.set("token", nil); api.token = nil; stage = .signIn
            error = "Your sign-in has expired. Please sign in again."
        } catch { self.error = error.localizedDescription }
    }

    func endSignIn(_ entry: SignInEntry) async {
        do {
            _ = try await api.send("api/sessions/" + entry.id, method: "DELETE", as: OKResponse.self)
            await loadProfile()
        } catch { self.error = error.localizedDescription }
    }

    func show(_ section: Section) {
        self.section = section
        if section == .profile { Task { await loadProfile() } }
    }

    // MARK: Updates

    /// Updates install in place: no need to download the app again from the website.
    func checkForUpdate(quietly: Bool = false) async {
        guard api.token != nil else { return }
        if !quietly { updateState = .checking }
        lastUpdateCheck = Date()
        do {
            noteRelease(try await api.send("api/mac-app/latest", as: AppRelease.self))
            if !quietly && update == nil { updateState = .upToDate }
        } catch {
            if !quietly { updateState = .failed(error.localizedDescription) }
        }
    }

    private func noteRelease(_ release: AppRelease) {
        update = release.build > AppInfo.build ? release : nil
        if update == nil, case .checking = updateState { updateState = .upToDate }
    }

    func installUpdate() async {
        guard let release = update, updateState != .downloading, updateState != .installing else { return }
        updateState = .downloading
        let work = FileManager.default.temporaryDirectory.appendingPathComponent("hn-vpn-update-" + UUID().uuidString)
        do {
            let zip = try await api.download("api/mac-app")
            defer { try? FileManager.default.removeItem(at: zip) }
            let digest = SHA256.hash(data: try Data(contentsOf: zip, options: .mappedIfSafe)).map { String(format: "%02x", $0) }.joined()
            guard digest == release.sha256 else { throw APIError(message: "The update didn’t download correctly. Please try again.", status: 0) }
            updateState = .installing
            try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
            guard await Shell.run("/usr/bin/ditto", ["-x", "-k", zip.path, work.path]).status == 0,
                  let app = try FileManager.default.contentsOfDirectory(at: work, includingPropertiesForKeys: nil).first(where: { $0.pathExtension == "app" }),
                  let bundle = Bundle(url: app), bundle.bundleIdentifier == Bundle.main.bundleIdentifier,
                  Int(bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0 > AppInfo.build
            else { throw APIError(message: "The update isn’t a newer Secure Network app.", status: 0) }
            guard await Shell.run("/usr/bin/codesign", ["--verify", "--deep", app.path]).status == 0 else { throw APIError(message: "The update’s signature didn’t check out, so it wasn’t installed.", status: 0) }
            _ = await Shell.run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", app.path])
            let installed = try await replaceApp(with: app)
            relaunch(installed)
        } catch {
            try? FileManager.default.removeItem(at: work)
            updateState = .failed(error.localizedDescription)
        }
    }

    /// Swaps this app's bundle for the new one (taking the new one's name, if the app was renamed).
    /// The running copy keeps going until it relaunches. Returns where the new app now is.
    private func replaceApp(with app: URL) async throws -> URL {
        let current = Bundle.main.bundleURL
        let target = current.deletingLastPathComponent().appendingPathComponent(app.lastPathComponent)
        do {
            if target.path == current.path {
                _ = try FileManager.default.replaceItemAt(target, withItemAt: app)
            } else {
                if FileManager.default.fileExists(atPath: target.path) { _ = try FileManager.default.replaceItemAt(target, withItemAt: app) }
                else { try FileManager.default.moveItem(at: app, to: target) }
                try? FileManager.default.removeItem(at: current)
            }
            return target
        } catch {
            // In a folder this Mac user can't change (such as /Applications on a shared Mac): ask once.
            let q = Shell.quote
            let command = "set -e; rm -rf \(q(target.path + ".new")); /usr/bin/ditto \(q(app.path)) \(q(target.path + ".new")); rm -rf \(q(current.path)) \(q(target.path)); mv \(q(target.path + ".new")) \(q(target.path))"
            let result = await Shell.runAsAdmin(command, prompt: "HN Secure Network needs your password to install its update.")
            if result.status != 0 { throw APIError(message: result.output.contains("-128") ? "The update was cancelled." : "The update couldn’t be installed.", status: 0) }
            return target
        }
    }

    private func relaunch(_ app: URL) {
        let pid = ProcessInfo.processInfo.processIdentifier
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", "while /bin/kill -0 \(pid) 2>/dev/null; do sleep 0.2; done; /usr/bin/open \(Shell.quote(app.path))"]
        try? process.run()
        NSApp.terminate(nil)
    }

    /// After an update that changed the helper, reinstall just the helper (one password prompt).
    func updateHelper() async {
        guard let bundled = Bundle.main.url(forResource: "hn-vpn-ctl", withExtension: nil) else { return }
        busy = true; defer { busy = false }
        let result = await Shell.runAsAdmin("install -m 755 -o root -g wheel \(Shell.quote(bundled.path)) \(Paths.helper)", prompt: "HN Secure Network needs to finish its update.")
        if result.status != 0 && !result.output.contains("-128") { error = "The update couldn’t finish: " + lastLine(result.output) }
        helperOutdated = Paths.helperOutdated
    }

    // MARK: SSH

    /// Opens an SSH session to the server in Terminal, signed in with the password typed in the app.
    /// The password is handed to ssh once through a private, self-deleting askpass helper; it's never
    /// saved, put on a command line or shown.
    func openSSH(password: String) async {
        let user = sshUser.trimmingCharacters(in: .whitespaces)
        guard user.range(of: "^[a-z_][a-z0-9_.-]{0,31}$", options: .regularExpression) != nil else { error = "Enter a valid username."; return }
        guard !password.isEmpty else { error = "Enter your password."; return }
        UserDefaults.standard.set(user, forKey: "sshUser")
        error = nil; sshBusy = true; defer { sshBusy = false }
        if !connected { await connect() }
        guard connected else { error = error ?? "Connect to the VPN first."; return }
        // Make sure the server answers through the VPN before opening Terminal, so a session never
        // sits waiting on a connection that can't work.
        await checkServer()
        if serverReachable != true {
            try? await Task.sleep(nanoseconds: 2_000_000_000); await checkServer()
        }
        guard serverReachable == true else {
            error = "The VPN is on, but the HN Group server isn’t answering through it yet. Try disconnecting and connecting again. If it keeps happening, the server’s VPN port (UDP 51820) may be blocked, or the server needs its latest update."
            return
        }
        do {
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("hn-ssh-" + UUID().uuidString)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let secret = dir.appendingPathComponent("p"), askpass = dir.appendingPathComponent("askpass"), command = dir.appendingPathComponent("HN Group server.command")
            FileManager.default.createFile(atPath: secret.path, contents: Data(password.utf8), attributes: [.posixPermissions: 0o600])
            let q = Shell.quote
            // Gives the password once, then deletes it.
            try "#!/bin/sh\nif [ -f \(q(secret.path)) ]; then cat \(q(secret.path)); rm -f \(q(secret.path)); else exit 1; fi\n"
                .write(to: askpass, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: askpass.path)
            let script = [
                "#!/bin/bash",
                "rm -f \"$0\"",
                "clear",
                "printf '\\033]0;HN Group server\\007'",
                "echo 'HN Secure Network · connecting to \(user)@\(VPNModel.serverAddress) through the VPN…'",
                "SSH_ASKPASS=\(q(askpass.path)) SSH_ASKPASS_REQUIRE=force DISPLAY=hn /usr/bin/ssh -o StrictHostKeyChecking=accept-new -o NumberOfPasswordPrompts=1 -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=4 \(q(user))@\(VPNModel.serverAddress)",
                "status=$?",
                "rm -f \(q(secret.path))",
                "if [ $status -eq 255 ]; then echo; echo 'HN Secure Network couldn’t open the session: the server didn’t answer, or the password wasn’t accepted.'; echo 'Check the VPN is connected in HN Secure Network, then try again.'; echo; read -r -p 'Press Return to close this window.' _; fi",
                "rm -rf \(q(dir.path))",
            ].joined(separator: "\n") + "\n"
            try script.write(to: command, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: command.path)
            let terminal = URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app")
            _ = try await NSWorkspace.shared.open([command], withApplicationAt: terminal, configuration: NSWorkspace.OpenConfiguration())
            // If the session never asks for the password, don't leave it behind.
            Task { try? await Task.sleep(nanoseconds: 60_000_000_000); try? FileManager.default.removeItem(at: secret) }
        } catch { self.error = "Terminal couldn’t be opened: " + error.localizedDescription }
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
