import SwiftUI
import AppKit

/// HN Group Secure Terminal for HN Group staff: the HN Group VPN (a private link to the server) and
/// SSH to the server, in a full app window with a shield in the menu bar for quick access.
@main
struct HNGroupVPNApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = VPNModel.shared

    init() { Theme.registerFont() }

    var body: some Scene {
        Window("HN Group Secure Terminal", id: "main") {
            MainView().environmentObject(model)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .defaultPosition(.center)
        .defaultSize(width: 920, height: 640)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Check for Updates…") { Task { model.show(.settings); await model.checkForUpdate() } }
            }
        }

        MenuBarExtra {
            MenuView().environmentObject(model)
        } label: {
            Image(systemName: model.connected ? "lock.shield.fill" : "lock.shield")
                .accessibilityLabel(model.connected ? "HN Group Secure Terminal: connected" : "HN Group Secure Terminal: not connected")
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

// MARK: - Shared pieces

/// The staff profile picture, or initials on the HN gradient.
struct AvatarView: View {
    let image: NSImage?
    let name: String
    var size: CGFloat = 32
    var body: some View {
        Group {
            if let image = image {
                Image(nsImage: image).resizable().interpolation(.high).aspectRatio(contentMode: .fill)
            } else {
                let letters = name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined().uppercased()
                Text(letters.isEmpty ? "?" : letters)
                    .font(Theme.font(size * 0.38, .bold)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(LinearGradient(colors: [Theme.purple, Theme.pink], startPoint: .topLeading, endPoint: .bottomTrailing))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

struct Banner: View {
    enum Kind { case error, info }
    let kind: Kind
    let icon: String
    let title: String
    var text: String? = nil
    var action: (label: String, run: () -> Void)? = nil
    var busy = false
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: icon).font(.system(size: 18, weight: .semibold))
                .foregroundStyle(kind == .error ? Theme.danger : Theme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.font(13, .bold)).fixedSize(horizontal: false, vertical: true)
                if let text = text { Text(text).font(Theme.font(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true) }
            }
            Spacer(minLength: 8)
            if busy { ProgressView().controlSize(.small) }
            else if let action = action { Button(action.label, action: action.run).buttonStyle(HNButtonStyle()) }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill((kind == .error ? Theme.danger : Theme.purple).opacity(0.1)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder((kind == .error ? Theme.danger : Theme.purple).opacity(0.2)))
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

enum When {
    private static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    private static let plain = ISO8601DateFormatter()
    static func date(_ s: String?) -> Date? { s.flatMap { iso.date(from: $0) ?? plain.date(from: $0) } }
    static func short(_ s: String?) -> String {
        guard let d = date(s) else { return "—" }
        return d.formatted(.dateTime.day().month(.abbreviated).hour().minute())
    }
    static func ago(_ s: String?) -> String {
        guard let d = date(s) else { return "Never connected" }
        let seconds = Date().timeIntervalSince(d)
        if seconds < 180 { return "Connected" }
        return RelativeDateTimeFormatter().localizedString(for: d, relativeTo: Date())
    }
}

// MARK: - Main window

struct MainView: View {
    @EnvironmentObject var model: VPNModel

    var body: some View {
        VStack(spacing: 0) {
            HNStripe().frame(height: 4)
            Group {
                switch model.stage {
                case .signIn, .waiting: WelcomeView()
                case .ready: SignedInView()
                }
            }
            .animation(.easeInOut(duration: 0.25), value: model.stage)
        }
        .frame(minWidth: 860, minHeight: 600)
        .background(Theme.background)
        .font(Theme.font(14))
        .foregroundStyle(Theme.text)
        .ignoresSafeArea(.container, edges: .top)
    }
}

/// Signed out: a two-part welcome, the HN shield on the left and sign-in on the right.
struct WelcomeView: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var glow = false

    var body: some View {
        HStack(spacing: 0) {
            ZStack {
                LinearGradient(colors: [Theme.purple, Color(hex: 0x3A0D80), Theme.navy], startPoint: .topLeading, endPoint: .bottomTrailing)
                Circle().stroke(Color.white.opacity(0.12), style: StrokeStyle(lineWidth: 2, dash: [6, 8])).frame(width: 300, height: 300)
                    .rotationEffect(.degrees(glow && !reduceMotion ? 360 : 0))
                    .animation(reduceMotion ? nil : .linear(duration: 60).repeatForever(autoreverses: false), value: glow)
                Circle().fill(Theme.pink.opacity(0.25)).frame(width: 220, height: 220).blur(radius: 50)
                    .scaleEffect(glow && !reduceMotion ? 1.1 : 0.9)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 3).repeatForever(autoreverses: true), value: glow)
                VStack(spacing: 18) {
                    ZStack {
                        Image(systemName: "shield.fill").font(.system(size: 120)).foregroundStyle(.white.opacity(0.96))
                            .shadow(color: .black.opacity(0.25), radius: 20, y: 10)
                        Text("HN").font(Theme.font(38, .heavy)).foregroundStyle(Theme.purple).offset(y: -4)
                    }
                    Text("Secure access to\nHN Group’s server.").font(Theme.font(24, .heavy)).foregroundStyle(.white).multilineTextAlignment(.center)
                }
                VStack { Spacer(); HStack { Text("For HN Group staff only").font(Theme.font(12, .semibold)).foregroundStyle(.white.opacity(0.7)); Spacer() }.padding(24) }
            }
            .frame(width: 380)
            .onAppear { glow = true }

            VStack(alignment: .leading, spacing: 18) {
                Spacer()
                HStack(spacing: 12) {
                    HNWordmark(height: 34)
                    Rectangle().fill(Theme.border).frame(width: 1, height: 28)
                    Text("Secure Terminal").font(Theme.font(20, .heavy))
                }
                if model.stage == .waiting {
                    HStack(spacing: 10) {
                        ProgressView().controlSize(.small)
                        Text("Finish signing in in your browser").font(Theme.font(24, .heavy))
                    }
                    Text("When HN Group Auth asks, allow your browser to open HN Group Secure Terminal. You’ll come straight back here.")
                        .foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                    HStack(spacing: 10) {
                        Button("Open the sign-in page again") { model.signIn() }.buttonStyle(HNButtonStyle(primary: false))
                        Button("Cancel") { model.cancelSignIn() }.buttonStyle(HNButtonStyle(primary: false))
                    }
                } else {
                    Text("Welcome to Secure Terminal").font(Theme.font(28, .heavy)).fixedSize(horizontal: false, vertical: true)
                    Text("A private, encrypted link from this Mac to HN Group’s server, and SSH to the server with just your password. Only traffic to the server uses the VPN.")
                        .foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                    VStack(alignment: .leading, spacing: 10) {
                        Feature(icon: "lock.fill", text: "Encrypted with WireGuard")
                        Feature(icon: "terminal.fill", text: "SSH to the server in one step")
                        Feature(icon: "person.badge.key.fill", text: "Your HN Group staff account")
                    }
                    .padding(.vertical, 4)
                    Button { model.signIn() } label: { Label("Sign in with HN Group Auth", systemImage: "arrow.up.forward.app") }
                        .buttonStyle(HNButtonStyle(wide: true))
                        .keyboardShortcut(.defaultAction)
                    Text("Your browser opens HN Group Auth. You’ll need your password and six-digit PIN.")
                        .font(Theme.font(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                }
                if let error = model.error { Banner(kind: .error, icon: "exclamationmark.circle.fill", title: error) }
                Spacer()
                Text(AppInfo.label).font(Theme.font(11)).foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 44).padding(.vertical, 30)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct Feature: View {
    let icon: String
    let text: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.accent)
                .frame(width: 28, height: 28).background(Circle().fill(Theme.accentSoft))
            Text(text).font(Theme.font(14, .semibold))
        }
    }
}

/// Signed in: a sidebar and the chosen page.
struct SignedInView: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        HStack(spacing: 0) {
            Sidebar()
            Rectangle().fill(Theme.border).frame(width: 1)
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        notices
                        switch model.section {
                        case .connection: ConnectionPage()
                        case .ssh: SSHPage()
                        case .profile: ProfilePage()
                        case .settings: SettingsPage()
                        }
                    }
                    .padding(.horizontal, 32).padding(.top, 34).padding(.bottom, 28)
                    .frame(maxWidth: 760, alignment: .leading)
                    .frame(maxWidth: .infinity)
                    .animation(.easeInOut(duration: 0.2), value: model.section)
                }
            }
        }
    }

    @ViewBuilder private var notices: some View {
        if let release = model.update {
            Banner(kind: .info, icon: "arrow.down.circle.fill",
                   title: "Secure Terminal \(release.version) is ready",
                   text: model.updateState == .downloading ? "Downloading…" : model.updateState == .installing ? "Installing… the app will reopen by itself." : "You have \(AppInfo.version). The update installs here, with no need to download the app again.",
                   action: ("Update now", { Task { await model.installUpdate() } }),
                   busy: model.updateState == .downloading || model.updateState == .installing)
        }
        if case .failed(let message) = model.updateState, model.section != .settings {
            Banner(kind: .error, icon: "exclamationmark.triangle.fill", title: message)
        }
        if model.needsReconfigure {
            Banner(kind: .info, icon: "arrow.triangle.2.circlepath", title: "Finish updating this Mac’s VPN connection",
                   text: "The VPN now only carries traffic to the HN Group server. macOS will ask for your Mac password once.",
                   action: ("Update", { Task { await model.reconfigure() } }), busy: model.busy)
        }
        if model.helperOutdated {
            Banner(kind: .info, icon: "wrench.and.screwdriver.fill", title: "Finish updating", text: "macOS will ask for your Mac password once.",
                   action: ("Finish", { Task { await model.updateHelper() } }), busy: model.busy)
        }
        if let error = model.error {
            Banner(kind: .error, icon: "exclamationmark.circle.fill", title: error, action: ("Dismiss", { model.error = nil }))
        }
    }
}

struct Sidebar: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                HNWordmark(height: 26)
                Rectangle().fill(Theme.border).frame(width: 1, height: 22)
                Text("Secure Terminal").font(Theme.font(14, .heavy)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.horizontal, 10).padding(.top, 40).padding(.bottom, 22)

            NavItem(icon: "power", title: "Connection", section: .connection)
            NavItem(icon: "terminal", title: "SSH", section: .ssh)
            NavItem(icon: "person.crop.circle", title: "Profile", section: .profile)
            NavItem(icon: "gearshape", title: "Settings", section: .settings, dot: model.update != nil)

            Spacer()

            HStack(spacing: 8) {
                Circle().fill(model.connected ? Theme.green : Theme.muted.opacity(0.5)).frame(width: 8, height: 8)
                Text(model.connected ? "Connected" : model.isSetUp ? "Not connected" : "Not set up yet").font(Theme.font(12, .semibold)).foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 12).padding(.bottom, 8)

            Button { model.show(.profile) } label: {
                HStack(spacing: 10) {
                    AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 36)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(model.user?.displayName ?? "Signed in").font(Theme.font(13, .bold)).lineLimit(1)
                        Text(model.user?.email ?? "").font(Theme.font(11)).foregroundStyle(Theme.muted).lineLimit(1).truncationMode(.middle)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(Theme.muted)
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(model.section == .profile ? Theme.accentSoft : Theme.surface2))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Your VPN profile")
        }
        .padding(14)
        .frame(width: 240)
        .background(Theme.surface)
    }
}

struct NavItem: View {
    @EnvironmentObject var model: VPNModel
    let icon: String
    let title: String
    let section: VPNModel.Section
    var dot = false
    @State private var hover = false
    var body: some View {
        let selected = model.section == section
        Button { model.show(section) } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).frame(width: 20)
                Text(title).font(Theme.font(14, selected ? .bold : .medium))
                Spacer()
                if dot { Circle().fill(Theme.pink).frame(width: 8, height: 8) }
            }
            .foregroundStyle(selected ? Theme.accent : Theme.text)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(selected ? Theme.accentSoft : hover ? Theme.surface2 : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

struct PageTitle: View {
    let eyebrow: String
    let title: String
    var text: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eyebrow).font(Theme.font(11, .heavy)).tracking(1.2).textCase(.uppercase).foregroundStyle(Theme.accent)
            Text(title).font(Theme.font(30, .heavy))
            if let text = text { Text(text).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true) }
        }
        .padding(.bottom, 4)
    }
}

// MARK: - Connection

struct ConnectionPage: View {
    @EnvironmentObject var model: VPNModel
    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        return part + (model.user.map { ", " + ($0.displayName.split(separator: " ").first.map(String.init) ?? $0.displayName) } ?? "")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(eyebrow: "HN Group Secure Terminal", title: greeting)
            if !model.wireGuardInstalled || !model.isSetUp {
                SetupCard()
            } else {
                ConnectCard()
                HStack(spacing: 14) {
                    StatTile(icon: "server.rack", label: "HN Group server", value: VPNModel.serverAddress, good: model.serverReachable == true)
                    StatTile(icon: "checkmark.shield", label: "Server status",
                             value: !model.connected ? "Connect to reach it" : model.serverReachable == nil ? "Checking…" : model.serverReachable == true ? "Reachable" : "Not reachable",
                             good: model.serverReachable == true)
                    StatTile(icon: "laptopcomputer", label: "This Mac", value: model.deviceName ?? "—")
                }
            }
        }
    }
}

/// The two setup steps, with progress.
struct SetupCard: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        let toolsDone = model.wireGuardInstalled
        Card(padding: 26) {
            VStack(alignment: .leading, spacing: 18) {
                Badge(text: "Set up · step \(toolsDone ? 2 : 1) of 2")
                Text("Let’s get this Mac ready").font(Theme.font(22, .heavy))
                StepRow(number: 1, done: toolsDone, active: !toolsDone, title: "Install the WireGuard tools",
                        text: "The fast, secure open-source VPN behind Secure Terminal. This opens Terminal and installs it with Homebrew; come back here when it finishes.") {
                    Button("Install WireGuard tools") { model.installWireGuard() }.buttonStyle(HNButtonStyle())
                }
                Divider()
                StepRow(number: 2, done: false, active: toolsDone, title: "Set up this Mac",
                        text: "Registers this Mac with a key that never leaves it. Only traffic to HN Group’s server will use the VPN. macOS asks for your Mac password once.") {
                    Button { Task { await model.setUp() } } label: {
                        HStack(spacing: 8) { if model.busy { ProgressView().controlSize(.small) }; Text(model.busy ? "Setting up…" : "Set up this Mac") }
                    }
                    .buttonStyle(HNButtonStyle()).disabled(model.busy || !toolsDone)
                }
            }
        }
    }
}

struct StepRow<Action: View>: View {
    let number: Int
    let done: Bool
    let active: Bool
    let title: String
    let text: String
    @ViewBuilder var action: Action
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle().fill(done ? Theme.green : active ? Theme.purple : Theme.surface2)
                if done { Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundStyle(.white) }
                else { Text("\(number)").font(Theme.font(13, .heavy)).foregroundStyle(active ? .white : Theme.muted) }
            }
            .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(Theme.font(15, .bold)).foregroundStyle(done || active ? Theme.text : Theme.muted)
                Text(text).font(Theme.font(13)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(2)
                if active && !done { action.padding(.top, 6) }
            }
        }
        .opacity(done || active ? 1 : 0.7)
    }
}

/// The big connect button on a card that lights up when connected.
struct ConnectCard: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 30) {
            Button { Task { await model.toggle() } } label: {
                ZStack {
                    Circle().fill(Color.white.opacity(model.connected ? 0.16 : 0)).frame(width: 176, height: 176)
                        .scaleEffect(pulse && model.connected && !reduceMotion ? 1.07 : 0.95)
                        .animation(reduceMotion ? nil : .easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: pulse)
                    Circle().fill(model.connected ? AnyShapeStyle(Color.white) : AnyShapeStyle(Theme.surface2))
                        .frame(width: 140, height: 140)
                        .overlay(Circle().strokeBorder(model.connected ? Color.clear : Theme.accent.opacity(0.35), lineWidth: 2))
                        .shadow(color: .black.opacity(model.connected ? 0.25 : 0.08), radius: 18, y: 8)
                    if model.busy { ProgressView().controlSize(.large) }
                    else { Image(systemName: "power").font(.system(size: 50, weight: .semibold)).foregroundStyle(Theme.purple) }
                }
                .frame(width: 180, height: 180)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(model.busy)
            .accessibilityLabel(model.connected ? "Disconnect" : "Connect")
            .onAppear { pulse = true }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Circle().fill(model.connected ? Color.white : Theme.muted.opacity(0.6)).frame(width: 9, height: 9)
                    Text(model.connected ? "PROTECTED" : "NOT PROTECTED").font(Theme.font(11, .heavy)).tracking(1.2)
                }
                .foregroundStyle(model.connected ? Color.white.opacity(0.9) : Theme.muted)
                Text(model.connected ? "Connected" : "Not connected").font(Theme.font(34, .heavy))
                    .foregroundStyle(model.connected ? Color.white : Theme.text)
                Text(model.connected ? "This Mac has a private link to HN Group’s server. Everything else uses your normal internet." : "Press the button for a private link to HN Group’s server.")
                    .foregroundStyle(model.connected ? Color.white.opacity(0.85) : Theme.muted).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Button(model.connected ? "Disconnect" : "Connect") { Task { await model.toggle() } }
                        .buttonStyle(HNButtonStyle(primary: !model.connected))
                        .disabled(model.busy)
                    if model.connected {
                        Button { model.show(.ssh) } label: { Label("SSH", systemImage: "terminal") }
                            .buttonStyle(HNButtonStyle())
                    }
                }
                .padding(.top, 6)
            }
            Spacer(minLength: 0)
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous).fill(model.connected
                ? AnyShapeStyle(LinearGradient(colors: [Theme.purple, Color(hex: 0x3A0D80), Theme.teal], startPoint: .topLeading, endPoint: .bottomTrailing))
                : AnyShapeStyle(Theme.surface))
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(model.connected ? Color.clear : Theme.border))
        .shadow(color: (model.connected ? Theme.purple : Color.black).opacity(model.connected ? 0.3 : 0.06), radius: 18, y: 8)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: model.connected)
    }
}

struct StatTile: View {
    let icon: String
    let label: String
    let value: String
    var good = false
    var body: some View {
        Card(padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(good ? Theme.success : Theme.accent)
                    .frame(width: 30, height: 30).background(RoundedRectangle(cornerRadius: 9).fill(good ? Theme.green.opacity(0.15) : Theme.accentSoft))
                Text(label).font(Theme.font(12)).foregroundStyle(Theme.muted)
                Text(value).font(Theme.font(15, .bold)).lineLimit(1).truncationMode(.middle)
            }
        }
    }
}

// MARK: - SSH

/// SSH to the server through the VPN: the address and username are filled in; only the password is asked for.
struct SSHPage: View {
    @EnvironmentObject var model: VPNModel
    @State private var password = ""
    @FocusState private var passwordFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(eyebrow: "SSH", title: "Connect to the server", text: "Opens a Terminal window signed in to HN Group’s server through the VPN.")
            Card(padding: 26) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 14) {
                        Image(systemName: "terminal.fill").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
                            .frame(width: 52, height: 52)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(LinearGradient(colors: [Theme.purple, Theme.navy], startPoint: .topLeading, endPoint: .bottomTrailing)))
                        VStack(alignment: .leading, spacing: 3) {
                            Text("HN Group server").font(Theme.font(17, .bold))
                            HStack(spacing: 6) {
                                Circle().fill(model.serverReachable == true ? Theme.green : Theme.muted.opacity(0.5)).frame(width: 8, height: 8)
                                Text(!model.connected ? "Connects the VPN first" : model.serverReachable == true ? "Reachable through the VPN" : "Checking the server…")
                                    .font(Theme.font(12)).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    Divider()
                    FieldRow(label: "Server address") {
                        Text(VPNModel.serverAddress).font(.system(size: 14, weight: .semibold, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
                            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border))
                    }
                    FieldRow(label: "Username") {
                        TextField("root", text: $model.sshUser).textFieldStyle(HNFieldStyle()).font(.system(size: 14, design: .monospaced))
                            .disableAutocorrection(true)
                    }
                    FieldRow(label: "Password") {
                        SecureField("Your server password", text: $password).textFieldStyle(HNFieldStyle())
                            .focused($passwordFocused)
                            .onSubmit(go)
                    }
                    HStack(spacing: 12) {
                        Button(action: go) {
                            HStack(spacing: 8) {
                                if model.sshBusy { ProgressView().controlSize(.small) } else { Image(systemName: "terminal") }
                                Text(model.connected ? "Open SSH session" : "Connect and open SSH")
                            }
                        }
                        .buttonStyle(HNButtonStyle())
                        .keyboardShortcut(.defaultAction)
                        .disabled(model.sshBusy || model.busy || password.isEmpty || !model.isSetUp)
                        Text("Your password isn’t saved.").font(Theme.font(12)).foregroundStyle(Theme.muted)
                    }
                    if !model.isSetUp {
                        Text("Set up this Mac on the Connection page first.").font(Theme.font(12, .semibold)).foregroundStyle(Theme.danger)
                    }
                }
            }
            Text("Terminal opens and signs you in as \(model.sshUser.isEmpty ? "root" : model.sshUser)@\(VPNModel.serverAddress). The first time, the server’s key is remembered so later connections are checked against it.")
                .font(Theme.font(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
        }
        .onAppear { passwordFocused = true }
    }

    private func go() {
        guard !password.isEmpty, !model.sshBusy else { return }
        let typed = password
        password = ""
        Task { await model.openSSH(password: typed) }
    }
}

struct FieldRow<Field: View>: View {
    let label: String
    @ViewBuilder var field: Field
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(Theme.font(12, .bold)).foregroundStyle(Theme.muted)
            field
        }
    }
}

struct HNFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .textFieldStyle(.plain)
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border))
    }
}

// MARK: - Profile

struct ProfilePage: View {
    @EnvironmentObject var model: VPNModel
    private let labels = ["sign-in.web": "Signed in on the website", "sign-in.app": "Signed in to Secure Terminal", "sign-out.other": "Signed out another sign-in",
                          "device.add": "Added a device", "device.remove": "Removed a device", "mac-app.publish": "Published a Secure Terminal build"]
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 22) {
                AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 96)
                    .overlay(Circle().strokeBorder(Theme.surface, lineWidth: 4))
                    .shadow(color: Theme.purple.opacity(0.25), radius: 14, y: 6)
                VStack(alignment: .leading, spacing: 6) {
                    Text("YOUR VPN PROFILE").font(Theme.font(11, .heavy)).tracking(1.2).foregroundStyle(Theme.accent)
                    Text(model.user?.displayName ?? "").font(Theme.font(30, .heavy))
                    Text(model.user?.email ?? "").foregroundStyle(Theme.muted)
                    HStack(spacing: 8) {
                        Badge(text: model.user?.admin == true ? "VPN administrator" : "HN Group staff")
                        if let p = model.profile { Badge(text: "\(p.devices.count) of \(p.limit) devices", colour: Theme.teal) }
                    }
                    .padding(.top, 2)
                }
            }
            Text("Your name and photo come from your HN Group staff profile. Change them in the staff portal.")
                .font(Theme.font(12)).foregroundStyle(Theme.muted)

            if let p = model.profile {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Where you’re signed in").font(Theme.font(16, .bold)).padding(.bottom, 4)
                        ForEach(p.sessions) { s in
                            ListRow(icon: s.kind == "app" ? "laptopcomputer" : "globe",
                                    title: (s.kind == "app" ? "Secure Terminal" + (s.appVersion.map { " " + $0 } ?? "") : "Website") + (s.current ? " · this Mac" : ""),
                                    subtitle: "Signed in \(When.short(s.createdAt)) · last used \(When.short(s.lastUsedAt))") {
                                if s.current { Badge(text: "Current", colour: Theme.success) }
                                else { Button("Sign out") { Task { await model.endSignIn(s) } }.buttonStyle(HNButtonStyle(primary: false)) }
                            }
                        }
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("Your devices").font(Theme.font(16, .bold))
                            Spacer()
                            Button("Manage on the web") { NSWorkspace.shared.open(API.base) }.buttonStyle(.plain).foregroundStyle(Theme.accent).font(Theme.font(12, .bold))
                        }
                        .padding(.bottom, 4)
                        if p.devices.isEmpty { Text("No devices yet.").foregroundStyle(Theme.muted) }
                        ForEach(p.devices) { d in
                            ListRow(icon: d.name.range(of: "mac|book|laptop", options: [.regularExpression, .caseInsensitive]) != nil ? "laptopcomputer" : "iphone",
                                    title: d.name, subtitle: d.address) {
                                Badge(text: When.ago(d.lastHandshake), colour: d.connected == true ? Theme.success : Theme.muted)
                            }
                        }
                    }
                }
                Card {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Recent activity").font(Theme.font(16, .bold)).padding(.bottom, 10)
                        if p.activity.isEmpty { Text("Nothing yet.").foregroundStyle(Theme.muted) }
                        ForEach(Array(p.activity.enumerated()), id: \.offset) { _, a in
                            HStack(spacing: 12) {
                                Circle().fill(Theme.purple).frame(width: 8, height: 8).overlay(Circle().stroke(Theme.accentSoft, lineWidth: 4))
                                Text(labels[a.action] ?? a.action).font(Theme.font(13, .medium))
                                Spacer()
                                Text(When.short(a.at)).font(Theme.font(12)).foregroundStyle(Theme.muted)
                            }
                            .padding(.vertical, 9)
                        }
                    }
                }
            } else {
                HStack { Spacer(); ProgressView(); Spacer() }.padding(40)
            }
        }
    }
}

struct ListRow<Trailing: View>: View {
    let icon: String
    let title: String
    let subtitle: String
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.accent)
                .frame(width: 38, height: 38).background(RoundedRectangle(cornerRadius: 11).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 11).strokeBorder(Theme.border))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.font(14, .bold)).lineLimit(1)
                Text(subtitle).font(Theme.font(12)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface2))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border))
    }
}

// MARK: - Settings

struct SettingsPage: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(eyebrow: "Settings", title: "Settings")
            Card {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 14) {
                        Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 56, height: 56)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("HN Group Secure Terminal").font(Theme.font(16, .bold))
                            Text(AppInfo.label).font(Theme.font(13)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        updateControl
                    }
                    updateStatus
                }
            }
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    Text("General").font(Theme.font(16, .bold))
                    Toggle(isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Open Secure Terminal when I log in").font(Theme.font(14, .semibold))
                            Text("The shield stays in the menu bar for quick access.").font(Theme.font(12)).foregroundStyle(Theme.muted)
                        }
                    }
                    .toggleStyle(.switch).tint(Theme.purple)
                }
            }
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Account").font(Theme.font(16, .bold))
                    HStack(spacing: 10) {
                        Button("Manage devices on the web") { NSWorkspace.shared.open(API.base) }.buttonStyle(HNButtonStyle(primary: false))
                        Button("Refresh") { Task { await model.refresh() } }.buttonStyle(HNButtonStyle(primary: false))
                        Spacer()
                        Button("Sign out") { Task { await model.signOut() } }.buttonStyle(HNButtonStyle(primary: false))
                            .help("Disconnects and removes this Mac from the VPN.")
                    }
                    Text("Signing out disconnects and removes this Mac from the VPN.").font(Theme.font(12)).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    @ViewBuilder private var updateControl: some View {
        if model.update != nil {
            Button("Update now") { Task { await model.installUpdate() } }.buttonStyle(HNButtonStyle())
                .disabled(model.updateState == .downloading || model.updateState == .installing)
        } else {
            Button("Check for updates") { Task { await model.checkForUpdate() } }.buttonStyle(HNButtonStyle(primary: false))
                .disabled(model.updateState == .checking)
        }
    }

    @ViewBuilder private var updateStatus: some View {
        switch model.updateState {
        case .checking: Label("Checking…", systemImage: "arrow.triangle.2.circlepath").foregroundStyle(Theme.muted)
        case .upToDate: Label("You have the latest version.", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.success)
        case .downloading: Label("Downloading the update…", systemImage: "arrow.down.circle").foregroundStyle(Theme.accent)
        case .installing: Label("Installing… the app will reopen by itself.", systemImage: "gearshape.2").foregroundStyle(Theme.accent)
        case .failed(let message): Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger)
        case .idle:
            if let release = model.update { Label("Version \(release.version) is available.", systemImage: "sparkles").foregroundStyle(Theme.accent) }
        }
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
                Text("Secure Terminal").font(Theme.font(13, .heavy))
                Spacer()
                if model.stage == .ready, let user = model.user { AvatarView(image: model.avatar, name: user.displayName, size: 24) }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            HNStripe().frame(height: 4)
            VStack(alignment: .leading, spacing: 12) {
                if model.stage == .ready && model.isSetUp {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.connected ? "Connected" : "Not connected").font(Theme.font(16, .bold))
                                .foregroundStyle(model.connected ? Theme.success : Theme.text)
                            Text(model.connected ? "Server \(VPNModel.serverAddress)" : "VPN off").font(Theme.font(12)).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Toggle("", isOn: Binding(get: { model.connected }, set: { _ in Task { await model.toggle() } }))
                            .toggleStyle(.switch).tint(Theme.green).labelsHidden().disabled(model.busy)
                    }
                } else {
                    Text(model.stage == .ready ? "Finish setting up this Mac in the app." : "Sign in to use the VPN.")
                        .font(Theme.font(13)).foregroundStyle(Theme.muted)
                }
                if let release = model.update {
                    Button { open(.settings) } label: { Label("Version \(release.version) is ready to install", systemImage: "arrow.down.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(Theme.accent).font(Theme.font(12, .bold))
                }
                if model.stage == .ready && model.isSetUp {
                    Button { open(.ssh) } label: { Label("SSH to the server", systemImage: "terminal") }.buttonStyle(HNButtonStyle(primary: false, wide: true))
                }
                Button("Open Secure Terminal") { open(nil) }.buttonStyle(HNButtonStyle(wide: true))
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

    private func open(_ section: VPNModel.Section?) {
        if let section = section { model.show(section) }
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
    }
}
