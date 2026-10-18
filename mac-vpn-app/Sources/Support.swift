import Foundation
import Security
import CryptoKit
import AppKit

// MARK: - Keychain

/// Small values (the sign-in token, this Mac's device ID and its private key) kept in the login keychain.
enum Keychain {
    private static let service = "uk.org.hngroup.vpn"

    static func get(_ account: String) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                    kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ account: String, _ value: String?) {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        guard let value = value else { return }
        var add = query
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }
}

// MARK: - WireGuard keys

/// WireGuard keys are Curve25519 keys, base64-encoded. The private key is made here and never leaves this Mac.
struct DeviceKey {
    let privateKey: Curve25519.KeyAgreement.PrivateKey

    init() { privateKey = Curve25519.KeyAgreement.PrivateKey() }
    init?(base64: String) {
        guard let data = Data(base64Encoded: base64), let key = try? Curve25519.KeyAgreement.PrivateKey(rawRepresentation: data) else { return nil }
        privateKey = key
    }
    var privateBase64: String { privateKey.rawRepresentation.base64EncodedString() }
    var publicBase64: String { privateKey.publicKey.rawRepresentation.base64EncodedString() }
}

// MARK: - The VPN website's API

struct APIError: LocalizedError {
    let message: String
    let status: Int
    var restart = false
    var errorDescription: String? { message }
}

struct SignInResult: Decodable { let codeRequired: Bool?; let flow: String?; let token: String?; let user: User? }
struct User: Decodable { let displayName: String; let email: String; let admin: Bool? }
struct Device: Decodable { let id: String; let name: String; let address: String; let connected: Bool? }
struct Me: Decodable { let user: User; let devices: [Device] }
struct Connection: Decodable { let config: String }
struct NewDevice: Decodable { let device: Device; let connection: Connection }
struct IPInfo: Decodable { let ip: String; let viaVpn: Bool }
struct OKResponse: Decodable { let ok: Bool? }

final class API {
    static let base = URL(string: "https://vpn.hngroup.org.uk")!
    var token: String?

    func send<T: Decodable>(_ path: String, method: String = "GET", body: [String: Any]? = nil, as type: T.Type) async throws -> T {
        var request = URLRequest(url: API.base.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body = body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data, response: URLResponse
        do { (data, response) = try await URLSession.shared.data(for: request) }
        catch { throw APIError(message: "Can’t reach vpn.hngroup.org.uk. Check your internet connection.", status: 0) }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw APIError(message: object?["error"] as? String ?? "Something went wrong. Please try again.", status: status, restart: object?["restart"] as? Bool ?? false)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - Running commands

enum Shell {
    struct Result { let status: Int32; let output: String }

    /// Runs a program and waits for it, off the main thread.
    static func run(_ path: String, _ arguments: [String]) async -> Result {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: path)
                process.arguments = arguments
                let pipe = Pipe()
                process.standardOutput = pipe
                process.standardError = pipe
                do { try process.run() } catch {
                    continuation.resume(returning: Result(status: -1, output: error.localizedDescription)); return
                }
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                continuation.resume(returning: Result(status: process.terminationStatus, output: String(data: data, encoding: .utf8) ?? ""))
            }
        }
    }

    /// Runs a shell command as an administrator; macOS asks for the user's password.
    static func runAsAdmin(_ command: String, prompt: String) async -> Result {
        let escaped = command.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
        let promptEscaped = prompt.replacingOccurrences(of: "\"", with: "'")
        let script = "do shell script \"\(escaped)\" with prompt \"\(promptEscaped)\" with administrator privileges"
        return await run("/usr/bin/osascript", ["-e", script])
    }

    /// Wraps a value in single quotes for the shell.
    static func quote(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'" }
}

// MARK: - Paths

enum Paths {
    static let helper = "/usr/local/libexec/hn-vpn/hn-vpn-ctl"
    static let config = "/usr/local/etc/hn-vpn/hn-vpn.conf"
    static let sudoers = "/etc/sudoers.d/hn-group-vpn"
    static var wireGuardInstalled: Bool {
        ["/opt/homebrew/bin/wg-quick", "/usr/local/bin/wg-quick"].contains { FileManager.default.isExecutableFile(atPath: $0) }
    }
    static var homebrew: String? {
        ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    static var helperInstalled: Bool { FileManager.default.isExecutableFile(atPath: helper) }
}
