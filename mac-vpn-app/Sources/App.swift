import SwiftUI
import AppKit

/// HN Group VPN: a menu bar app for HN Group staff.
@main
struct HNGroupVPNApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = VPNModel.shared

    var body: some Scene {
        MenuBarExtra {
            MenuView().environmentObject(model)
        } label: {
            Image(systemName: model.connected ? "lock.shield.fill" : "lock.shield")
                .accessibilityLabel(model.connected ? "HN Group VPN: connected" : "HN Group VPN: not connected")
        }
        .menuBarExtraStyle(.window)
    }
}

/// Receives hngroupvpn:// links, which bring the sign-in back from the browser.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            Task { @MainActor in await VPNModel.shared.completeSignIn(url) }
        }
    }
}

private let purple = Color(red: 0x55 / 255, green: 0x14 / 255, blue: 0xB4 / 255)
private let green = Color(red: 0x5F / 255, green: 0xAE / 255, blue: 0x7B / 255)
private let stripe: [(Color, CGFloat)] = [
    (Color(red: 0xE9 / 255, green: 0x7D / 255, blue: 0xE8 / 255), 14), (purple, 14), (Color(red: 0xE3 / 255, green: 0xE6 / 255, blue: 0x5B / 255), 6),
    (Color(red: 0x3E / 255, green: 0x9B / 255, blue: 0xA3 / 255), 20), (Color(red: 0x7A / 255, green: 0x1F / 255, blue: 0x6C / 255), 10),
    (Color(red: 0xC2 / 255, green: 0x30 / 255, blue: 0x6B / 255), 10), (green, 13), (Color(red: 0x1C / 255, green: 0x21 / 255, blue: 0x35 / 255), 13),
]

struct MenuView: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Stripe().frame(height: 4)
            VStack(alignment: .leading, spacing: 14) {
                switch model.stage {
                case .signIn: SignInView()
                case .waiting: WaitingView()
                case .ready: ReadyView()
                }
                if let error = model.error {
                    Text(error).font(.callout).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                }
            }
            .padding(16)
            Divider()
            footer
        }
        .frame(width: 330)
        .animation(.easeInOut(duration: 0.2), value: model.stage)
        .animation(.easeInOut(duration: 0.2), value: model.connected)
    }

    private var header: some View {
        HStack(spacing: 10) {
            if let image = Wordmark.image(dark: scheme == .dark) {
                Image(nsImage: image).resizable().aspectRatio(contentMode: .fit).frame(height: 26)
            } else {
                Text("HN Group").font(.headline)
            }
            Divider().frame(height: 22)
            Text("VPN").font(.headline)
            Spacer()
            if model.stage == .ready {
                Circle().fill(model.connected ? green : Color.secondary.opacity(0.4)).frame(width: 9, height: 9)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private var footer: some View {
        HStack {
            Button("VPN website") { NSWorkspace.shared.open(API.base) }.buttonStyle(.link)
            Spacer()
            Button("Quit") { NSApplication.shared.terminate(nil) }.keyboardShortcut("q")
        }
        .font(.callout)
        .padding(.horizontal, 16).padding(.vertical, 10)
    }
}

struct Stripe: View {
    var body: some View {
        GeometryReader { geo in
            let total = stripe.reduce(0) { $0 + $1.1 }
            HStack(spacing: 0) {
                ForEach(0..<stripe.count, id: \.self) { i in
                    stripe[i].0.frame(width: geo.size.width * stripe[i].1 / total)
                }
            }
        }
    }
}

struct SignInView: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sign in").font(.title3.bold())
            Text("Sign in with your HN Group staff account through HN Group Auth. Your browser will open.")
                .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Spacer()
                Button("Sign in with HN Group Auth") { model.signIn() }
                    .buttonStyle(.borderedProminent).tint(purple)
                    .keyboardShortcut(.defaultAction)
            }
        }
    }
}

struct WaitingView: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                ProgressView().controlSize(.small)
                Text("Finish signing in in your browser").font(.headline)
            }
            Text("When HN Group Auth asks, allow your browser to open HN Group VPN.")
                .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            HStack {
                Button("Open the sign-in page again") { model.signIn() }.buttonStyle(.link)
                Spacer()
                Button("Cancel") { model.cancelSignIn() }.buttonStyle(.link)
            }
            .font(.callout)
        }
    }
}

struct ReadyView: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let user = model.user {
                Text("Signed in as \(user.displayName)").font(.callout).foregroundStyle(.secondary)
            }
            if !model.wireGuardInstalled {
                Text("This Mac needs the free WireGuard tools first.").font(.callout)
                Button("Install WireGuard tools") { model.installWireGuard() }
                Text("This opens Terminal and installs them with Homebrew. When it finishes, come back here.")
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            } else if !model.isSetUp {
                Text("Set up this Mac to use the VPN. macOS will ask for your Mac password once.")
                    .font(.callout).fixedSize(horizontal: false, vertical: true)
                Button {
                    Task { await model.setUp() }
                } label: {
                    if model.busy { ProgressView().controlSize(.small) } else { Text("Set up this Mac") }
                }
                .buttonStyle(.borderedProminent).tint(purple).disabled(model.busy)
            } else {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.connected ? "Connected" : "Not connected").font(.title3.bold())
                        if let ip = model.ip {
                            Text(model.connected && ip.viaVpn ? "Your traffic goes through HN Group · \(ip.ip)" : "Your IP address: \(ip.ip)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        if let name = model.deviceName { Text(name).font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    Toggle("", isOn: Binding(get: { model.connected }, set: { _ in Task { await model.toggle() } }))
                        .toggleStyle(.switch).tint(green).labelsHidden().disabled(model.busy)
                }
            }
            Divider()
            Toggle("Open at login", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
                .font(.callout)
            HStack {
                Button("Refresh") { Task { await model.refresh() } }.buttonStyle(.link)
                Spacer()
                Button("Sign out") { Task { await model.signOut() } }.buttonStyle(.link)
                    .help("Disconnects and removes this Mac from the VPN.")
            }
            .font(.callout)
        }
    }
}

enum Wordmark {
    static func image(dark: Bool) -> NSImage? {
        guard let url = Bundle.main.url(forResource: dark ? "wordmark-white" : "wordmark", withExtension: "png") else { return nil }
        return NSImage(contentsOf: url)
    }
}
