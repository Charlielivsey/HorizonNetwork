import Foundation
import SwiftUI
import AppKit
import CryptoKit

/// This Mac's HN Group device approval. HN Group apps only open, and only update, on computers approved on
/// devices.hngroup.org.uk. It shares its identity with HN Browser and HN Group App Manager on this Mac
/// (the same files their src/device.cjs uses, in ~/Library/Application Support/HN Group/Device):
/// device.json holds a random id and secret, made once by whichever app runs first; status.json keeps the
/// last answer, so an approved Mac keeps working for up to 7 days when devices.hngroup.org.uk can't be reached.
/// The server also gets a fingerprint of the Mac's hardware id (never the id itself), so a copied identity
/// on another Mac isn't trusted.
@MainActor
final class DeviceGate: ObservableObject {
    enum Status: String { case unknown, unlinked, pending, authorised, revoked, mismatch }
    static let origin = URL(string: "https://devices.hngroup.org.uk")!
    static let trustFor: Double = 7 * 86400 * 1000
    /// Screenshots and the App Manager login-item mode never check (and are never blocked).
    static let shared = DeviceGate(preview: CommandLine.arguments.contains("--snapshot") || CommandLine.arguments.contains("--app-manager-login-item"))

    @Published private(set) var status: Status = .unknown
    @Published private(set) var allowed = false
    @Published private(set) var offline = false
    @Published private(set) var checking = false
    @Published private(set) var code: String?
    @Published private(set) var owner: String?
    @Published private(set) var checkedAt: Date?
    @Published private(set) var linkURL = DeviceGate.origin.appendingPathComponent("link")

    private let preview: Bool
    private let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("HN Group", isDirectory: true).appendingPathComponent("Device", isDirectory: true)
    private var record: [String: Any]?
    private var fresh = false
    private var lastAttempt = Date.distantPast
    private var timer: Timer?

    init(preview: Bool, status: Status = .authorised, code: String? = nil) {
        self.preview = preview
        if preview {
            self.status = status; self.code = code; allowed = status == .authorised
            if let code = code { linkURL = Self.link(code) }
            return
        }
        if let data = try? Data(contentsOf: folder.appendingPathComponent("status.json")),
           let saved = try? JSONSerialization.jsonObject(with: data) as? [String: Any], Status(rawValue: saved["status"] as? String ?? "") != nil {
            record = saved
        }
        apply()
        // Not approved: checks every 15 seconds, so it opens by itself once approved. Approved: every 3 hours.
        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            guard let gate = self else { return }
            Task { @MainActor in
                if !gate.allowed || Date().timeIntervalSince(gate.lastAttempt) > 3 * 3600 { await gate.check() }
            }
        }
        Task { await check() }
    }

    private static func link(_ code: String?) -> URL {
        var url = URLComponents(url: origin.appendingPathComponent("link"), resolvingAgainstBaseURL: false)!
        if let code = code { url.queryItems = [URLQueryItem(name: "code", value: code)] }
        return url.url ?? origin
    }

    private func apply() {
        let wasAllowed = allowed
        guard let r = record, let s = Status(rawValue: r["status"] as? String ?? "") else {
            status = .unknown; allowed = false; return
        }
        status = s
        code = r["code"] as? String
        owner = (r["owner"] as? [String: Any])?["displayName"] as? String
        if let ms = r["checkedAt"] as? Double { checkedAt = Date(timeIntervalSince1970: ms / 1000) }
        let until = (r["trustUntil"] as? Double) ?? 0
        allowed = s == .authorised && (fresh || Date().timeIntervalSince1970 * 1000 < until)
        if let link = r["linkUrl"] as? String, link.hasPrefix(Self.origin.absoluteString + "/"), let url = URL(string: link) { linkURL = url } else { linkURL = Self.link(code) }
        // Revoked (a definite answer, not just offline) while connected: the VPN goes off too.
        if wasAllowed && !allowed && fresh { Task { await VPNModel.shared.disconnectIfConnected() } }
    }

    /// The identity every HN app on this Mac shares. Made once, exclusively, so two apps can't race.
    private func identity() throws -> (id: String, secret: String) {
        let file = folder.appendingPathComponent("device.json")
        func read() -> (String, String)? {
            guard let data = try? Data(contentsOf: file), let v = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = v["id"] as? String, let secret = v["secret"] as? String,
                  id.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", options: .regularExpression) != nil,
                  secret.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { return nil }
            return (id, secret)
        }
        if let saved = read() { return saved }
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw DeviceError.message("This Mac couldn’t make its device identity.") }
        let fresh = (UUID().uuidString.lowercased(), bytes.map { String(format: "%02x", $0) }.joined())
        let data = try JSONSerialization.data(withJSONObject: ["id": fresh.0, "secret": fresh.1, "createdAt": ISO8601DateFormatter().string(from: Date())], options: [.prettyPrinted])
        let exists = FileManager.default.fileExists(atPath: file.path)
        do { try data.write(to: file, options: exists ? [.atomic] : [.withoutOverwriting]) }
        catch { if let other = read() { return other }; try data.write(to: file, options: [.atomic]) }
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        return fresh
    }

    /// A fingerprint of this Mac's hardware id (IOPlatformUUID), the same one the other HN apps send.
    private static func machine() async -> String {
        let out = await Shell.run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]).output
        var raw = ""
        if let range = out.range(of: "\"IOPlatformUUID\"\\s*=\\s*\"([^\"]+)\"", options: .regularExpression) {
            raw = String(out[range]).components(separatedBy: "\"").dropLast().last ?? ""
        }
        if raw.isEmpty { raw = "host:" + ProcessInfo.processInfo.hostName + ":darwin" }
        return SHA256.hash(data: Data(("hn-group-device:" + raw.trimmingCharacters(in: .whitespaces).uppercased()).utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static var osName: String { "macOS \(ProcessInfo.processInfo.operatingSystemVersion.majorVersion)" }

    /// Asks devices.hngroup.org.uk. Offline or a server problem keeps the last answer.
    func check() async {
        guard !preview, !checking else { return }
        checking = true; lastAttempt = Date(); defer { checking = false }
        do {
            let id = try identity()
            let body: [String: Any] = ["id": id.id, "secret": id.secret, "machine": await Self.machine(), "name": Host.current().localizedName ?? ProcessInfo.processInfo.hostName,
                                       "platform": "darwin", "os": Self.osName, "app": "secure-network", "version": AppInfo.version]
            var request = URLRequest(url: Self.origin.appendingPathComponent("api/device/check"), timeoutInterval: 15)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let result: (Data, URLResponse)
            do { result = try await URLSession.shared.data(for: request) }
            catch { throw DeviceError.message("HN Group Devices can’t be reached. Check your internet connection.") }
            let (data, response) = result
            let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            guard (response as? HTTPURLResponse)?.statusCode == 200, let s = Status(rawValue: value["status"] as? String ?? ""), s != .unknown else {
                throw DeviceError.message(value["error"] as? String ?? "HN Group Devices couldn’t check this Mac right now.")
            }
            let now = Date().timeIntervalSince1970 * 1000
            var saved: [String: Any] = ["status": s.rawValue, "name": value["name"] as? String ?? "", "checkedAt": now,
                                        "trustUntil": s == .authorised ? now + min((value["trustFor"] as? Double) ?? Self.trustFor, Self.trustFor) : 0]
            if let name = (value["owner"] as? [String: Any])?["displayName"] as? String { saved["owner"] = ["displayName": name] }
            if let code = value["code"] as? String, code.range(of: "^[A-Z0-9]{4}-[A-Z0-9]{4}$", options: .regularExpression) != nil { saved["code"] = code }
            if let link = value["linkUrl"] as? String, link.hasPrefix(Self.origin.absoluteString + "/") { saved["linkUrl"] = link }
            record = saved; fresh = true; offline = false
            if let out = try? JSONSerialization.data(withJSONObject: saved, options: [.prettyPrinted]) {
                try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
                try? out.write(to: folder.appendingPathComponent("status.json"), options: [.atomic])
            }
        } catch {
            fresh = false; offline = true
        }
        apply()
    }

    func openDevicesSite() { NSWorkspace.shared.open(linkURL) }
}

enum DeviceError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

/// "This device is not authorised": shown instead of the app (and the menu bar's controls) until approved.
struct DeviceGateView: View {
    @ObservedObject var gate: DeviceGate
    var compact = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    private var title: String {
        switch gate.status {
        case .unknown: return gate.offline ? "Can’t check this Mac" : "Checking this Mac…"
        case .pending: return "Waiting for approval"
        case .authorised: return "This Mac is approved"
        default: return "This device is not authorised"
        }
    }
    private var text: String {
        switch gate.status {
        case .unknown: return gate.offline ? "HN Group Devices can’t be reached, and this Mac hasn’t been approved before. Check your internet connection, then try again." : "Checking with HN Group whether this Mac may use HN Group apps."
        case .unlinked: return "HN Group apps only work on computers HN Group has approved. Add this one to your account with this code."
        case .pending: return "This Mac has been added\(gate.owner.map { " by " + $0 } ?? ""). HN Secure Network opens by itself as soon as an HN Group administrator approves it."
        case .revoked: return "This Mac’s access to HN Group apps was revoked. If you think that’s a mistake, contact HN Group."
        case .mismatch: return "This Mac is using an identity copied from another computer. An HN Group administrator needs to approve this Mac before HN Group apps can be used."
        case .authorised: return "Opening…"
        }
    }
    private var tint: Color { gate.status == .pending ? Color(hex: 0xC98A00) : gate.status == .unknown ? Theme.accent : Theme.danger }

    var body: some View {
        VStack(spacing: compact ? 10 : 14) {
            if !compact { HNWordmark(height: 36).padding(.bottom, 8) }
            Image(systemName: gate.status == .pending ? "hourglass" : "lock.fill")
                .font(.system(size: compact ? 20 : 28, weight: .semibold)).foregroundStyle(tint)
                .frame(width: compact ? 48 : 76, height: compact ? 48 : 76)
                .background(RoundedRectangle(cornerRadius: compact ? 16 : 24, style: .continuous).fill(tint.opacity(0.12)))
                .scaleEffect(shown || reduceMotion ? 1 : 0.7).opacity(shown ? 1 : 0)
            Text("HN SECURE NETWORK").font(Theme.font(11, .heavy)).tracking(1.3).foregroundStyle(Theme.accent)
            Text(title).font(Theme.font(compact ? 18 : 25, .heavy)).tracking(-0.4).multilineTextAlignment(.center)
            Text(text).font(Theme.font(compact ? 12 : 14)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true).frame(maxWidth: 380)
            if gate.status == .unlinked, let code = gate.code {
                VStack(spacing: 2) {
                    Text("YOUR CODE").font(Theme.font(11, .heavy)).tracking(1).foregroundStyle(Theme.muted)
                    Text(code).font(.system(size: compact ? 22 : 30, weight: .heavy, design: .monospaced)).tracking(4).textSelection(.enabled)
                }
                .padding(.horizontal, 26).padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Theme.border, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                if !compact {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("1. Open **devices.hngroup.org.uk** and sign in with your HN Group account.")
                        Text("2. Type the code above to add this Mac.")
                        Text("3. An administrator approves it, and this opens by itself.")
                    }
                    .font(Theme.font(13)).foregroundStyle(Theme.muted).frame(maxWidth: 360, alignment: .leading)
                }
            }
            HStack(spacing: 10) {
                if [DeviceGate.Status.unlinked, .pending, .unknown].contains(gate.status) || gate.offline {
                    Button("Open devices.hngroup.org.uk") { gate.openDevicesSite() }.buttonStyle(HNButtonStyle())
                }
                Button { Task { await gate.check() } } label: {
                    if gate.checking { ProgressView().controlSize(.small) } else { Text("Check again") }
                }
                .buttonStyle(HNButtonStyle(primary: false)).disabled(gate.checking)
            }
            .padding(.top, 6)
            Text(gate.offline && gate.status != .unknown ? "Couldn’t reach HN Group Devices just now. It keeps trying." :
                    gate.checkedAt.map { "Checked \($0.formatted(date: .omitted, time: .shortened)). It checks again by itself." } ?? " ")
                .font(Theme.font(12)).foregroundStyle(Theme.muted)
            Button("Quit") { NSApplication.shared.terminate(nil) }.buttonStyle(.plain).font(Theme.font(12, .semibold)).foregroundStyle(Theme.muted)
        }
        .padding(compact ? 18 : 36)
        .frame(maxWidth: .infinity, maxHeight: compact ? nil : .infinity)
        .offset(y: shown || reduceMotion ? 0 : 12).opacity(shown ? 1 : 0)
        .onAppear { withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.45, dampingFraction: 0.8)) { shown = true } }
    }
}
