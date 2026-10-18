import SwiftUI
import AppKit

/// HN Group VPN for HN Group staff: a full app window, with a shield in the menu bar for quick access.
@main
struct HNGroupVPNApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = VPNModel.shared

    init() { Theme.registerFont() }

    var body: some Scene {
        Window("HN Group VPN", id: "main") {
            MainView().environmentObject(model)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentSize)
        .defaultPosition(.center)

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
    // Closing the window keeps the VPN (and the menu bar shield) running.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

// MARK: - Main window

struct MainView: View {
    @EnvironmentObject var model: VPNModel

    var body: some View {
        VStack(spacing: 0) {
            header
            HNStripe().frame(height: 5)
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch model.stage {
                    case .signIn: SignInPanel()
                    case .waiting: WaitingPanel()
                    case .ready: ReadyPanel()
                    }
                    if let error = model.error { ErrorBanner(text: error) }
                }
                .padding(24)
                .animation(.easeInOut(duration: 0.22), value: model.stage)
            }
            footer
        }
        .frame(width: 480, height: 660)
        .background(Theme.background)
        .font(Theme.font(14))
        .foregroundStyle(Theme.text)
    }

    private var header: some View {
        HStack(spacing: 12) {
            HNWordmark(height: 30)
            Rectangle().fill(Theme.border).frame(width: 1, height: 26)
            Text("VPN").font(Theme.font(18, .heavy))
            Spacer()
            if let user = model.user, model.stage == .ready {
                HStack(spacing: 8) {
                    Text(user.displayName).font(Theme.font(13, .semibold)).lineLimit(1)
                    Initials(name: user.displayName)
                }
            }
        }
        .padding(.leading, 22).padding(.trailing, 20)
        .padding(.top, 34).padding(.bottom, 14) // room for the window's traffic lights
        .background(Theme.surface)
    }

    private var footer: some View {
        HStack {
            Button("Manage devices on the web") { NSWorkspace.shared.open(API.base) }
                .buttonStyle(.plain).foregroundStyle(Theme.accent).font(Theme.font(12, .semibold))
            Spacer()
            Text("For HN Group staff only").font(Theme.font(12)).foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 22).padding(.vertical, 12)
        .background(Theme.surface)
        .overlay(Rectangle().fill(Theme.border).frame(height: 1), alignment: .top)
    }
}

struct Initials: View {
    let name: String
    var body: some View {
        let letters = name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
        Text(letters.isEmpty ? "?" : letters)
            .font(Theme.font(12, .bold)).foregroundStyle(.white)
            .frame(width: 30, height: 30)
            .background(Circle().fill(LinearGradient(colors: [Theme.purple, Theme.pink], startPoint: .topLeading, endPoint: .bottomTrailing)))
    }
}

struct ErrorBanner: View {
    let text: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Theme.danger)
            Text(text).font(Theme.font(13, .medium)).fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.danger.opacity(0.1)))
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }
}

struct SignInPanel: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        Card(padding: 28) {
            VStack(alignment: .leading, spacing: 16) {
                ZStack {
                    Circle().fill(Theme.accentSoft).frame(width: 64, height: 64)
                    Image(systemName: "lock.shield.fill").font(.system(size: 28)).foregroundStyle(Theme.accent)
                }
                Badge(text: "Staff only")
                Text("Private internet, wherever you work").font(Theme.font(26, .heavy)).fixedSize(horizontal: false, vertical: true)
                Text("When the VPN is on, all of this Mac’s internet traffic goes privately through HN Group’s server. Sign in with your HN Group staff account to get started.")
                    .font(Theme.font(14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                Button { model.signIn() } label: { Label("Sign in with HN Group Auth", systemImage: "person.badge.key.fill") }
                    .buttonStyle(HNButtonStyle(wide: true))
                    .keyboardShortcut(.defaultAction)
                    .padding(.top, 4)
                Text("Your browser opens HN Group Auth. You’ll need your password and six-digit PIN.")
                    .font(Theme.font(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct WaitingPanel: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        Card(padding: 28) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    ProgressView().controlSize(.small)
                    Text("Finish signing in in your browser").font(Theme.font(20, .bold))
                }
                Text("When HN Group Auth asks, allow your browser to open HN Group VPN. You’ll come straight back here.")
                    .font(Theme.font(14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Button("Open the sign-in page again") { model.signIn() }.buttonStyle(HNButtonStyle(primary: false))
                    Button("Cancel") { model.cancelSignIn() }.buttonStyle(HNButtonStyle(primary: false))
                }
            }
        }
    }
}

struct ReadyPanel: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if !model.wireGuardInstalled {
                SetupStep(number: 1, title: "Install the WireGuard tools", text: "The VPN uses WireGuard, a fast and secure open-source VPN. This opens Terminal and installs it with Homebrew. When it finishes, come back here.",
                          button: "Install WireGuard tools") { model.installWireGuard() }
            } else if !model.isSetUp {
                SetupStep(number: 2, title: "Set up this Mac", text: "This registers this Mac with the HN Group VPN using a key that never leaves it. macOS will ask for your Mac password once.",
                          button: model.busy ? "Setting up…" : "Set up this Mac") { Task { await model.setUp() } }
            } else {
                ConnectCard()
            }
            DetailsCard()
        }
    }
}

struct SetupStep: View {
    let number: Int
    let title: String
    let text: String
    let button: String
    let action: () -> Void
    @EnvironmentObject var model: VPNModel
    var body: some View {
        Card(padding: 26) {
            VStack(alignment: .leading, spacing: 14) {
                Badge(text: "Step \(number) of 2")
                Text(title).font(Theme.font(22, .heavy))
                Text(text).font(Theme.font(14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                Button(button, action: action).buttonStyle(HNButtonStyle(wide: true)).disabled(model.busy)
            }
        }
    }
}

/// The big connect button, its status and the address the internet sees.
struct ConnectCard: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        Card(padding: 28) {
            VStack(spacing: 18) {
                Button { Task { await model.toggle() } } label: {
                    ZStack {
                        if model.connected {
                            Circle().fill(Theme.green.opacity(0.18)).frame(width: 196, height: 196)
                                .scaleEffect(pulse && !reduceMotion ? 1.06 : 0.94)
                                .animation(reduceMotion ? nil : .easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: pulse)
                        }
                        Circle()
                            .fill(model.connected
                                  ? AnyShapeStyle(LinearGradient(colors: [Theme.purple, Theme.teal], startPoint: .topLeading, endPoint: .bottomTrailing))
                                  : AnyShapeStyle(Theme.surface2))
                            .frame(width: 164, height: 164)
                            .overlay(Circle().strokeBorder(model.connected ? Color.clear : Theme.accent.opacity(0.35), lineWidth: 2))
                            .shadow(color: (model.connected ? Theme.purple : Color.black).opacity(model.connected ? 0.35 : 0.08), radius: 18, y: 8)
                        if model.busy {
                            ProgressView().controlSize(.large)
                        } else {
                            Image(systemName: "power").font(.system(size: 54, weight: .semibold))
                                .foregroundStyle(model.connected ? Color.white : Theme.accent)
                        }
                    }
                    .frame(width: 200, height: 200)
                    .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(model.busy)
                .accessibilityLabel(model.connected ? "Disconnect" : "Connect")
                .onAppear { pulse = true }

                VStack(spacing: 6) {
                    Text(model.connected ? "Connected" : "Not connected").font(Theme.font(24, .heavy))
                        .foregroundStyle(model.connected ? Theme.success : Theme.text)
                    Text(model.connected ? "Your traffic is private and goes through HN Group." : "Press the button to connect.")
                        .font(Theme.font(14)).foregroundStyle(Theme.muted)
                    if let ip = model.ip {
                        HStack(spacing: 6) {
                            Image(systemName: "globe").font(.system(size: 12))
                            Text("The internet sees \(ip.ip)").font(Theme.font(12, .semibold))
                        }
                        .foregroundStyle(model.connected && ip.viaVpn ? Theme.success : Theme.muted)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Capsule().fill((model.connected && ip.viaVpn ? Theme.green : Theme.muted).opacity(0.12)))
                        .padding(.top, 4)
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}

struct DetailsCard: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        Card(padding: 20) {
            VStack(alignment: .leading, spacing: 0) {
                Text("This Mac").font(Theme.font(15, .bold)).padding(.bottom, 10)
                DetailRow(icon: "person.crop.circle", label: "Signed in as", value: model.user.map { $0.displayName + " · " + $0.email } ?? "—")
                DetailRow(icon: "laptopcomputer", label: "Device", value: model.deviceName ?? "Not set up yet")
                DetailRow(icon: "server.rack", label: "Server", value: "vpn.hngroup.org.uk · United Kingdom")
                Divider().padding(.vertical, 10)
                Toggle(isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) })) {
                    Text("Open HN Group VPN when I log in").font(Theme.font(13, .medium))
                }
                .toggleStyle(.switch).tint(Theme.purple)
                HStack(spacing: 10) {
                    Button("Refresh") { Task { await model.refresh() } }.buttonStyle(HNButtonStyle(primary: false))
                    Spacer()
                    Button("Sign out") { Task { await model.signOut() } }.buttonStyle(HNButtonStyle(primary: false))
                        .help("Disconnects and removes this Mac from the VPN.")
                }
                .padding(.top, 14)
            }
        }
    }
}

struct DetailRow: View {
    let icon: String
    let label: String
    let value: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon).foregroundStyle(Theme.accent).frame(width: 18)
            Text(label).font(Theme.font(13)).foregroundStyle(Theme.muted)
            Spacer(minLength: 12)
            Text(value).font(Theme.font(13, .semibold)).lineLimit(1).truncationMode(.middle)
        }
        .padding(.vertical, 7)
    }
}

// MARK: - Menu bar

struct MenuView: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                HNWordmark(height: 22)
                Rectangle().fill(Theme.border).frame(width: 1, height: 18)
                Text("VPN").font(Theme.font(14, .heavy))
                Spacer()
                Circle().fill(model.connected ? Theme.green : Theme.muted.opacity(0.5)).frame(width: 9, height: 9)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            HNStripe().frame(height: 4)
            VStack(alignment: .leading, spacing: 12) {
                if model.stage == .ready && model.isSetUp {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.connected ? "Connected" : "Not connected").font(Theme.font(16, .bold))
                            if let ip = model.ip { Text(ip.ip).font(Theme.font(12)).foregroundStyle(Theme.muted) }
                        }
                        Spacer()
                        Toggle("", isOn: Binding(get: { model.connected }, set: { _ in Task { await model.toggle() } }))
                            .toggleStyle(.switch).tint(Theme.green).labelsHidden().disabled(model.busy)
                    }
                } else {
                    Text(model.stage == .ready ? "Finish setting up this Mac in the app." : "Sign in to use the VPN.")
                        .font(Theme.font(13)).foregroundStyle(Theme.muted)
                }
                Button("Open HN Group VPN") {
                    openWindow(id: "main")
                    NSApp.activate(ignoringOtherApps: true)
                }
                .buttonStyle(HNButtonStyle(wide: true))
            }
            .padding(14)
            Divider()
            HStack {
                Button("VPN website") { NSWorkspace.shared.open(API.base) }.buttonStyle(.plain).foregroundStyle(Theme.accent)
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }.buttonStyle(.plain).keyboardShortcut("q")
            }
            .font(Theme.font(12, .semibold))
            .padding(.horizontal, 14).padding(.vertical, 10)
        }
        .frame(width: 300)
        .background(Theme.background)
        .foregroundStyle(Theme.text)
    }
}
