import SwiftUI
import AppKit

/// HN Secure Network for HN Group staff: the HN Group VPN (a private link to the server) and
/// SSH to the server, in a full app window with a shield in the menu bar for quick access.
@main
struct HNGroupVPNApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = VPNModel.shared

    init() { Theme.registerFont() }

    var body: some Scene {
        Window("HN Secure Network", id: "main") {
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
                .accessibilityLabel(model.connected ? "HN Secure Network: connected" : "HN Secure Network: not connected")
        }
        .menuBarExtraStyle(.window)
    }
}

/// Receives hngroupvpn:// links, which bring the sign-in back from the browser.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--snapshot"), i + 1 < args.count {
            Task { @MainActor in Snapshots.render(to: URL(fileURLWithPath: args[i + 1])); NSApp.terminate(nil) }
        }
    }
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
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.surface))
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill((kind == .error ? Theme.danger : Theme.purple).opacity(0.08)).padding(-1))
        .overlay(alignment: .leading) { RoundedRectangle(cornerRadius: 2).fill(kind == .error ? Theme.danger : Theme.violet).frame(width: 4).padding(.vertical, 10).padding(.leading, 6) }
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder((kind == .error ? Theme.danger : Theme.purple).opacity(0.25)))
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
        ZStack(alignment: .top) {
            Group {
                switch model.stage {
                case .signIn, .waiting: WelcomeView().transition(.opacity)
                case .ready: SignedInView().transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: model.stage)
            HNStripe().frame(height: 3)
        }
        .frame(minWidth: 900, minHeight: 620)
        .background(Theme.background)
        .font(Theme.font(14))
        .foregroundStyle(Theme.text)
        .ignoresSafeArea(.container, edges: .top)
    }
}

/// The animated connect orb: HN stripe colours turning around a glass button.
struct Orb: View {
    let on: Bool
    let busy: Bool
    var size: CGFloat = 200
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var spin = false
    @State private var breathe = false
    var body: some View {
        ZStack {
            Circle().fill((on ? Theme.violet : Theme.purple).opacity(on ? 0.55 : 0.18)).frame(width: size * 0.9, height: size * 0.9).blur(radius: size * 0.22)
                .scaleEffect(breathe && on && !reduceMotion ? 1.12 : 0.92)
            Circle().stroke(Color.white.opacity(0.06), lineWidth: 1).frame(width: size, height: size)
            Circle().stroke(Color.white.opacity(on ? 0.09 : 0.05), lineWidth: 1).frame(width: size * 0.86, height: size * 0.86)
            Circle().trim(from: 0, to: on || busy ? 1 : 0.0)
                .stroke(Theme.ring, style: StrokeStyle(lineWidth: size * 0.035, lineCap: .round))
                .frame(width: size * 0.74, height: size * 0.74)
                .rotationEffect(.degrees(spin && !reduceMotion ? 360 : 0))
                .opacity(on || busy ? 1 : 0)
            Circle().stroke(Color.white.opacity(0.12), lineWidth: size * 0.035).frame(width: size * 0.74, height: size * 0.74).opacity(on || busy ? 0 : 1)
            Circle().fill(on ? AnyShapeStyle(Theme.brand) : AnyShapeStyle(LinearGradient(colors: [Color(hex: 0x2A2650), Color(hex: 0x1A1736)], startPoint: .top, endPoint: .bottom)))
                .frame(width: size * 0.6, height: size * 0.6)
                .overlay(Circle().strokeBorder(Color.white.opacity(on ? 0.3 : 0.12), lineWidth: 1))
                .overlay(Circle().fill(LinearGradient(colors: [Color.white.opacity(0.22), .clear], startPoint: .top, endPoint: .center)).padding(3))
                .shadow(color: (on ? Theme.violet : Color.black).opacity(0.5), radius: size * 0.08, y: size * 0.04)
            if busy { ProgressView().controlSize(.large).tint(.white) }
            else { Image(systemName: "power").font(.system(size: size * 0.2, weight: .semibold)).foregroundStyle(on ? Color.white : Color.white.opacity(0.75)) }
        }
        .frame(width: size, height: size)
        .animation(reduceMotion ? nil : .spring(response: 0.6, dampingFraction: 0.8), value: on)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) { spin = true }
            withAnimation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true)) { breathe = true }
        }
    }
}

/// Signed out: the HN orb on a night panel, and sign-in.
struct WelcomeView: View {
    @EnvironmentObject var model: VPNModel

    var body: some View {
        HStack(spacing: 0) {
            ZStack {
                Theme.heroOn
                Circle().fill(Theme.pink.opacity(0.18)).frame(width: 260).blur(radius: 70).offset(x: -90, y: -160)
                Circle().fill(Theme.teal.opacity(0.18)).frame(width: 240).blur(radius: 70).offset(x: 110, y: 170)
                VStack(spacing: 26) {
                    Orb(on: true, busy: false, size: 220)
                    VStack(spacing: 8) {
                        Text("Private by default.").font(Theme.font(26, .heavy)).foregroundStyle(.white)
                        Text("Encrypted. Fast. Yours.").font(Theme.font(15, .medium)).foregroundStyle(.white.opacity(0.65))
                    }
                }
                VStack { Spacer(); HStack(spacing: 8) { Image(systemName: "checkmark.seal.fill"); Text("For HN Group staff") }.font(Theme.font(12, .semibold)).foregroundStyle(.white.opacity(0.6)).padding(.bottom, 26) }
            }
            .frame(width: 400)
            .clipped()

            VStack(alignment: .leading, spacing: 20) {
                Spacer()
                HStack(spacing: 12) {
                    AppMark(size: 40)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("HN GROUP").font(Theme.font(10, .heavy)).tracking(1.6).foregroundStyle(Theme.accent)
                        Text("Secure Network").font(Theme.font(20, .heavy))
                    }
                }
                if model.stage == .waiting {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            ProgressView().controlSize(.small)
                            Text("Finish signing in in your browser").font(Theme.font(26, .heavy)).tracking(-0.4)
                        }
                        Text("When HN Group Auth asks, allow your browser to open HN Secure Network. You’ll come straight back here.")
                            .foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                        HStack(spacing: 10) {
                            Button("Open the sign-in page again") { model.signIn() }.buttonStyle(HNButtonStyle(primary: false))
                            Button("Cancel") { model.cancelSignIn() }.buttonStyle(HNButtonStyle(primary: false))
                        }
                    }
                    .transition(.opacity.combined(with: .offset(y: 8)))
                } else {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Welcome back.").font(Theme.font(34, .heavy)).tracking(-0.8)
                        Text("Send all of this Mac’s internet traffic through HN Group’s private VPN, and open SSH sessions to the server with just your password.")
                            .foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                        VStack(alignment: .leading, spacing: 12) {
                            Feature(icon: "lock.fill", title: "Encrypted with WireGuard", text: "Modern, fast and audited.")
                            Feature(icon: "globe.europe.africa.fill", title: "All your traffic, protected", text: "Through HN Group’s UK server.")
                            Feature(icon: "terminal.fill", title: "SSH in one step", text: "Straight to the HN Group server.")
                        }
                        .padding(.vertical, 6)
                        Button { model.signIn() } label: { HStack(spacing: 8) { Text("Sign in with HN Group Auth"); Image(systemName: "arrow.up.right") } }
                            .buttonStyle(HNButtonStyle(wide: true))
                            .keyboardShortcut(.defaultAction)
                        Text("Your browser opens HN Group Auth. You’ll need your password and six-digit PIN.")
                            .font(Theme.font(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    .transition(.opacity.combined(with: .offset(y: 8)))
                }
                if let error = model.error { Banner(kind: .error, icon: "exclamationmark.circle.fill", title: error) }
                Spacer()
                Text(AppInfo.label).font(Theme.font(11)).foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 54).padding(.vertical, 34)
            .frame(maxWidth: 520, alignment: .leading)
            .frame(maxWidth: .infinity)
            .animation(.easeInOut(duration: 0.25), value: model.stage)
        }
    }
}

struct Feature: View {
    let icon: String
    let title: String
    var text: String? = nil
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.accent)
                .frame(width: 34, height: 34).background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.accentSoft))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(Theme.font(14, .bold))
                if let text = text { Text(text).font(Theme.font(12)).foregroundStyle(Theme.muted) }
            }
        }
    }
}

/// Signed in: a translucent sidebar and the chosen page.
struct SignedInView: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 0) {
            Sidebar()
            Rectangle().fill(Theme.border.opacity(0.7)).frame(width: 1)
            ZStack(alignment: .topTrailing) {
                Circle().fill(Theme.violet.opacity(0.10)).frame(width: 420).blur(radius: 120).offset(x: 140, y: -160).allowsHitTesting(false)
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        notices
                        Group {
                            switch model.section {
                            case .connection: ConnectionPage()
                            case .ssh: SSHPage()
                            case .profile: ProfilePage()
                            case .settings: SettingsPage()
                            }
                        }
                        .id(model.section)
                        .transition(reduceMotion ? .opacity : .asymmetric(insertion: .opacity.combined(with: .offset(y: 12)), removal: .opacity))
                    }
                    .padding(.horizontal, 36).padding(.top, 42).padding(.bottom, 32)
                    .frame(maxWidth: 780, alignment: .leading)
                    .frame(maxWidth: .infinity)
                    .animation(.easeOut(duration: 0.25), value: model.section)
                }
            }
        }
    }

    @ViewBuilder private var notices: some View {
        if let release = model.update {
            Banner(kind: .info, icon: "arrow.down.circle.fill",
                   title: "Secure Network \(release.version) is ready",
                   text: model.updateState == .downloading ? "Downloading…" : model.updateState == .installing ? "Installing… the app will reopen by itself." : "You have \(AppInfo.version). The update installs here, with no need to download the app again.",
                   action: ("Update now", { Task { await model.installUpdate() } }),
                   busy: model.updateState == .downloading || model.updateState == .installing)
        }
        if case .failed(let message) = model.updateState, model.section != .settings {
            Banner(kind: .error, icon: "exclamationmark.triangle.fill", title: message)
        }
        if model.needsReconfigure {
            Banner(kind: .info, icon: "arrow.triangle.2.circlepath", title: "Finish updating this Mac’s VPN connection",
                   text: "The VPN now carries all of this Mac’s internet traffic again. macOS will ask for your Mac password once.",
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
    @Namespace private var selection
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 10) {
                AppMark(size: 32)
                VStack(alignment: .leading, spacing: 0) {
                    Text("HN GROUP").font(Theme.font(9, .heavy)).tracking(1.4).foregroundStyle(Theme.accent)
                    Text("Secure Network").font(Theme.font(15, .heavy)).lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            .padding(.horizontal, 8).padding(.top, 46).padding(.bottom, 24)

            Text("MENU").font(Theme.font(10, .heavy)).tracking(1.2).foregroundStyle(Theme.muted.opacity(0.8)).padding(.horizontal, 12).padding(.bottom, 4)
            NavItem(icon: "power", title: "Connection", section: .connection, selection: selection)
            NavItem(icon: "terminal", title: "SSH", section: .ssh, selection: selection)
            NavItem(icon: "person.crop.circle", title: "Profile", section: .profile, selection: selection)
            NavItem(icon: "gearshape", title: "Settings", section: .settings, selection: selection, dot: model.update != nil)

            Spacer()

            // Live status, always visible.
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill((model.connected ? Theme.green : Theme.muted).opacity(0.2)).frame(width: 22, height: 22)
                    Circle().fill(model.connected ? Theme.green : Theme.muted.opacity(0.6)).frame(width: 8, height: 8)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(model.connected ? "Protected" : model.isSetUp ? "Not protected" : "Not set up yet").font(Theme.font(12, .bold))
                    Text(model.connected ? (model.ip?.ip ?? "Through HN Group") : "VPN off").font(Theme.font(11)).foregroundStyle(Theme.muted).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface.opacity(0.6)))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Theme.border.opacity(0.7)))
            .padding(.bottom, 8)
            .animation(.easeInOut(duration: 0.25), value: model.connected)

            Button { model.show(.profile) } label: {
                HStack(spacing: 10) {
                    AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(model.user?.displayName ?? "Signed in").font(Theme.font(13, .bold)).lineLimit(1)
                        Text(model.user?.email ?? "").font(Theme.font(11)).foregroundStyle(Theme.muted).lineLimit(1).truncationMode(.middle)
                    }
                    Spacer(minLength: 0)
                }
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(model.section == .profile ? Theme.accentSoft : Color.clear))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Your VPN profile")
        }
        .padding(12)
        .frame(width: 232)
        .background(VisualEffect(material: .sidebar))
    }
}

struct NavItem: View {
    @EnvironmentObject var model: VPNModel
    let icon: String
    let title: String
    let section: VPNModel.Section
    let selection: Namespace.ID
    var dot = false
    @State private var hover = false
    var body: some View {
        let selected = model.section == section
        Button { withAnimation(.spring(response: 0.35, dampingFraction: 0.82)) { model.show(section) } } label: {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).frame(width: 20)
                Text(title).font(Theme.font(14, selected ? .bold : .medium))
                Spacer()
                if dot { Circle().fill(Theme.pink).frame(width: 8, height: 8) }
            }
            .foregroundStyle(selected ? Theme.accent : Theme.text.opacity(hover ? 1 : 0.85))
            .padding(.horizontal, 12).padding(.vertical, 9)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.accentSoft)
                        .overlay(alignment: .leading) { Capsule().fill(Theme.accent).frame(width: 3, height: 16).padding(.leading, 2) }
                        .matchedGeometryEffect(id: "selection", in: selection)
                } else if hover {
                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.text.opacity(0.05))
                }
            }
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
            Text(eyebrow).font(Theme.font(11, .heavy)).tracking(1.4).textCase(.uppercase).foregroundStyle(Theme.accent)
            Text(title).font(Theme.font(30, .heavy)).tracking(-0.6)
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
            PageTitle(eyebrow: Date().formatted(.dateTime.weekday(.wide).day().month(.wide)), title: greeting)
            if !model.wireGuardInstalled || !model.isSetUp {
                SetupCard()
            } else {
                ConnectCard()
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
                    InfoTile(icon: "network", label: "Your traffic appears as", value: model.ip?.ip ?? "Checking…",
                             note: model.ip.map { $0.viaVpn ? "HN Group VPN address" : "Your own connection" } ?? "", good: model.ip?.viaVpn == true)
                    InfoTile(icon: "mappin.and.ellipse", label: "Location", value: model.connected ? "United Kingdom" : "Where you are",
                             note: model.connected ? "HN Group server, London" : "Connect to go through the UK", good: model.connected)
                    InfoTile(icon: "server.rack", label: "HN Group server", value: VPNModel.serverAddress,
                             note: !model.connected ? "Connect to reach it" : model.serverReachable == nil ? "Checking…" : model.serverReachable == true ? "Reachable for SSH" : "Not answering yet",
                             good: model.serverReachable == true)
                    InfoTile(icon: "laptopcomputer", label: "This Mac", value: model.deviceName ?? "—", note: "Its key never leaves this Mac")
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
        Card(padding: 28) {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 6) {
                        Badge(text: "Set up · step \(toolsDone ? 2 : 1) of 2")
                        Text("Let’s get this Mac ready").font(Theme.font(24, .heavy)).tracking(-0.4)
                    }
                    Spacer()
                    ZStack {
                        Circle().stroke(Theme.border, lineWidth: 5)
                        Circle().trim(from: 0, to: toolsDone ? 0.5 : 0.08).stroke(Theme.brand, style: StrokeStyle(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90))
                        Text(toolsDone ? "1/2" : "0/2").font(Theme.font(12, .heavy))
                    }
                    .frame(width: 54, height: 54)
                    .animation(.easeInOut(duration: 0.5), value: toolsDone)
                }
                StepRow(number: 1, done: toolsDone, active: !toolsDone, title: "Install the WireGuard tools",
                        text: "The fast, secure open-source VPN behind Secure Network. This opens Terminal and installs it with Homebrew; come back here when it finishes.") {
                    Button("Install WireGuard tools") { model.installWireGuard() }.buttonStyle(HNButtonStyle())
                }
                StepRow(number: 2, done: false, active: toolsDone, title: "Set up this Mac",
                        text: "Registers this Mac with a key that never leaves it. While it’s on, all of this Mac’s traffic will use the VPN. macOS asks for your Mac password once.") {
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
        HStack(alignment: .top, spacing: 16) {
            ZStack {
                Circle().fill(done ? AnyShapeStyle(Theme.green) : active ? AnyShapeStyle(Theme.brand) : AnyShapeStyle(Theme.surface2))
                Circle().strokeBorder(done || active ? Color.clear : Theme.border)
                if done { Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundStyle(.white) }
                else { Text("\(number)").font(Theme.font(13, .heavy)).foregroundStyle(active ? .white : Theme.muted) }
            }
            .frame(width: 32, height: 32)
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(Theme.font(15, .bold)).foregroundStyle(done || active ? Theme.text : Theme.muted)
                Text(text).font(Theme.font(13)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(2)
                if active && !done { action.padding(.top, 6) }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(active ? Theme.accentSoft.opacity(0.55) : Theme.surface2.opacity(0.6)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(active ? Theme.accent.opacity(0.25) : Theme.border.opacity(0.6)))
        .opacity(done || active ? 1 : 0.75)
    }
}

/// The hero: a night panel with the connect orb, status and a live timer.
struct ConnectCard: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 34) {
            Button { Task { await model.toggle() } } label: { Orb(on: model.connected, busy: model.busy, size: 210) }
                .buttonStyle(.plain)
                .disabled(model.busy)
                .accessibilityLabel(model.connected ? "Disconnect" : "Connect")

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Circle().fill(model.connected ? Theme.green : Color.white.opacity(0.4)).frame(width: 8, height: 8)
                        .shadow(color: model.connected ? Theme.green : .clear, radius: 6)
                    Text(model.busy ? "WORKING…" : model.connected ? "PROTECTED" : "NOT PROTECTED").font(Theme.font(11, .heavy)).tracking(1.6)
                }
                .foregroundStyle(Color.white.opacity(0.75))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                Text(model.connected ? "You’re protected" : "You’re not protected").font(Theme.font(32, .heavy)).tracking(-0.8).foregroundStyle(.white)
                Text(model.connected ? "All of this Mac’s internet traffic is encrypted and going through HN Group’s UK server." : "Turn on the VPN to encrypt all of this Mac’s traffic through HN Group’s UK server.")
                    .foregroundStyle(Color.white.opacity(0.7)).fixedSize(horizontal: false, vertical: true).lineSpacing(2)
                if model.connected, let since = model.connectedSince {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Label(Self.duration(context.date.timeIntervalSince(since)), systemImage: "clock")
                            .font(Theme.font(13, .semibold).monospacedDigit()).foregroundStyle(Color.white.opacity(0.8))
                    }
                }
                HStack(spacing: 10) {
                    Button { Task { await model.toggle() } } label: { Text(model.connected ? "Disconnect" : "Connect") }
                        .buttonStyle(HeroButtonStyle(filled: !model.connected))
                        .disabled(model.busy)
                    if model.connected {
                        Button { model.show(.ssh) } label: { Label("Open SSH", systemImage: "terminal") }
                            .buttonStyle(HeroButtonStyle(filled: false))
                    }
                }
                .padding(.top, 6)
            }
            Spacer(minLength: 0)
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous).fill(model.connected ? Theme.heroOn : Theme.heroOff)
                Circle().fill(Theme.pink.opacity(model.connected ? 0.22 : 0.06)).frame(width: 260).blur(radius: 80).offset(x: 260, y: -90)
                Circle().fill(Theme.teal.opacity(model.connected ? 0.22 : 0.05)).frame(width: 220).blur(radius: 80).offset(x: -220, y: 110)
            }
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        )
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.white.opacity(0.08)))
        .shadow(color: (model.connected ? Theme.purple : Color.black).opacity(0.28), radius: 24, y: 12)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.45), value: model.connected)
    }

    static func duration(_ t: TimeInterval) -> String {
        let s = max(0, Int(t)); let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "Connected for %d:%02d:%02d", h, m, sec) : String(format: "Connected for %02d:%02d", m, sec)
    }
}

/// Buttons on the dark hero panel.
struct HeroButtonStyle: ButtonStyle {
    let filled: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.font(13.5, .bold))
            .foregroundStyle(filled ? Theme.purple : Color.white)
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(Capsule().fill(filled ? Color.white : Color.white.opacity(configuration.isPressed ? 0.2 : 0.1)))
            .overlay(Capsule().strokeBorder(Color.white.opacity(filled ? 0 : 0.2)))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
            .contentShape(Capsule())
    }
}

struct InfoTile: View {
    let icon: String
    let label: String
    let value: String
    var note: String = ""
    var good = false
    @State private var hover = false
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(good ? Theme.success : Theme.accent)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(good ? Theme.green.opacity(0.15) : Theme.accentSoft))
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(Theme.font(11, .semibold)).foregroundStyle(Theme.muted)
                Text(value).font(Theme.font(15, .bold)).lineLimit(1).truncationMode(.middle)
                if !note.isEmpty { Text(note).font(Theme.font(11)).foregroundStyle(good ? Theme.success : Theme.muted).lineLimit(1) }
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(hover ? Theme.accent.opacity(0.35) : Theme.border.opacity(0.8)))
        .shadow(color: .black.opacity(hover ? 0.08 : 0.04), radius: hover ? 12 : 8, y: hover ? 6 : 3)
        .offset(y: hover ? -2 : 0)
        .animation(.easeOut(duration: 0.18), value: hover)
        .onHover { hover = $0 }
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
            // A small terminal preview of what will run.
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    Circle().fill(Color(hex: 0xFF5F57)).frame(width: 11, height: 11)
                    Circle().fill(Color(hex: 0xFEBC2E)).frame(width: 11, height: 11)
                    Circle().fill(Color(hex: 0x28C840)).frame(width: 11, height: 11)
                    Spacer()
                    Text("HN Group server").font(Theme.font(11, .semibold)).foregroundStyle(.white.opacity(0.5))
                    Spacer()
                    HStack(spacing: 6) {
                        Circle().fill(model.serverReachable == true ? Theme.green : Color.white.opacity(0.3)).frame(width: 7, height: 7)
                        Text(!model.connected ? "VPN off" : model.serverReachable == true ? "Reachable" : "Checking…").font(Theme.font(11, .semibold)).foregroundStyle(.white.opacity(0.6))
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(Color.white.opacity(0.05))
                VStack(alignment: .leading, spacing: 6) {
                    (Text("~ ").foregroundColor(Theme.green) + Text("ssh ").foregroundColor(.white) + Text("\(model.sshUser.isEmpty ? "root" : model.sshUser)@\(VPNModel.serverAddress)").foregroundColor(Color(hex: 0xC9B4FF)))
                    Text(model.connected ? "Ready when you are." : "The VPN connects first, then Terminal opens.").foregroundColor(.white.opacity(0.45))
                }
                .font(.system(size: 13, design: .monospaced))
                .padding(16)
            }
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Theme.night))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.08)))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.2), radius: 16, y: 8)

            Card(padding: 24) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 14) {
                        FieldRow(label: "Server address") {
                            Text(VPNModel.serverAddress).font(.system(size: 14, weight: .semibold, design: .monospaced))
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).padding(.vertical, 10)
                                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.surface2))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.border))
                        }
                        FieldRow(label: "Username") {
                            TextField("root", text: $model.sshUser).textFieldStyle(HNFieldStyle()).font(.system(size: 14, design: .monospaced))
                                .disableAutocorrection(true)
                        }
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
                        Label("Your password isn’t saved", systemImage: "lock").font(Theme.font(12)).foregroundStyle(Theme.muted)
                    }
                    if !model.isSetUp {
                        Text("Set up this Mac on the Connection page first.").font(Theme.font(12, .semibold)).foregroundStyle(Theme.danger)
                    }
                }
            }
            Text("The first time, the server’s key is remembered so later connections are checked against it.")
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
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.surface2))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Theme.border))
    }
}

// MARK: - Profile

struct ProfilePage: View {
    @EnvironmentObject var model: VPNModel
    private let labels = ["sign-in.web": "Signed in on the website", "sign-in.app": "Signed in to Secure Network", "sign-out.other": "Signed out another sign-in",
                          "device.add": "Added a device", "device.remove": "Removed a device", "mac-app.publish": "Published a Secure Network build"]
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            // Header card with the brand banner.
            VStack(alignment: .leading, spacing: 0) {
                ZStack {
                    Theme.heroOn
                    Circle().fill(Theme.pink.opacity(0.25)).frame(width: 200).blur(radius: 60).offset(x: 220, y: -20)
                    HNStripe().frame(height: 3).frame(maxHeight: .infinity, alignment: .bottom)
                }
                .frame(height: 96)
                HStack(alignment: .bottom, spacing: 18) {
                    AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 92)
                        .overlay(Circle().strokeBorder(Theme.surface, lineWidth: 5))
                        .shadow(color: Theme.purple.opacity(0.3), radius: 12, y: 6)
                        .offset(y: -34).padding(.bottom, -34)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.user?.displayName ?? "").font(Theme.font(26, .heavy)).tracking(-0.5)
                        Text(model.user?.email ?? "").foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    HStack(spacing: 8) {
                        Badge(text: model.user?.admin == true ? "VPN administrator" : "HN Group staff")
                        if let p = model.profile { Badge(text: "\(p.devices.count) of \(p.limit) devices", colour: Theme.teal) }
                    }
                }
                .padding(.horizontal, 22).padding(.top, 12).padding(.bottom, 20)
            }
            .background(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).fill(Theme.surface))
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).strokeBorder(Theme.border.opacity(0.8)))
            .shadow(color: .black.opacity(0.05), radius: 10, y: 4)
            Text("Your name and photo come from your HN Group staff profile. Change them in the staff portal or HN Browser.")
                .font(Theme.font(12)).foregroundStyle(Theme.muted)

            if let p = model.profile {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: "Where you’re signed in", icon: "key.fill")
                        ForEach(p.sessions) { s in
                            ListRow(icon: s.kind == "app" ? "laptopcomputer" : "globe",
                                    title: (s.kind == "app" ? "Secure Network" + (s.appVersion.map { " " + $0 } ?? "") : "Website") + (s.current ? " · this Mac" : ""),
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
                            SectionHeading(title: "Your devices", icon: "laptopcomputer.and.iphone")
                            Spacer()
                            Button("Manage on the web") { NSWorkspace.shared.open(API.base) }.buttonStyle(.plain).foregroundStyle(Theme.accent).font(Theme.font(12, .bold))
                        }
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
                        SectionHeading(title: "Recent activity", icon: "clock.arrow.circlepath").padding(.bottom, 8)
                        if p.activity.isEmpty { Text("Nothing yet.").foregroundStyle(Theme.muted) }
                        ForEach(Array(p.activity.enumerated()), id: \.offset) { i, a in
                            HStack(alignment: .top, spacing: 14) {
                                VStack(spacing: 0) {
                                    Circle().fill(Theme.brand).frame(width: 10, height: 10).overlay(Circle().stroke(Theme.accentSoft, lineWidth: 3))
                                    if i < p.activity.count - 1 { Rectangle().fill(Theme.border).frame(width: 2).frame(maxHeight: .infinity) }
                                }
                                .frame(width: 12)
                                Text(labels[a.action] ?? a.action).font(Theme.font(13, .medium)).padding(.bottom, 14)
                                Spacer()
                                Text(When.short(a.at)).font(Theme.font(12)).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
            } else {
                HStack { Spacer(); ProgressView(); Spacer() }.padding(40)
            }
        }
    }
}

struct SectionHeading: View {
    let title: String
    let icon: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).foregroundStyle(Theme.accent)
            Text(title).font(Theme.font(16, .bold))
        }
        .padding(.bottom, 2)
    }
}

struct ListRow<Trailing: View>: View {
    let icon: String
    let title: String
    let subtitle: String
    @ViewBuilder var trailing: Trailing
    @State private var hover = false
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.accent)
                .frame(width: 38, height: 38).background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Theme.accentSoft))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(Theme.font(14, .bold)).lineLimit(1)
                Text(subtitle).font(Theme.font(12)).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(hover ? Theme.surface2 : Theme.surface2.opacity(0.6)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Theme.border.opacity(0.7)))
        .animation(.easeOut(duration: 0.15), value: hover)
        .onHover { hover = $0 }
    }
}

// MARK: - Settings

struct SettingsPage: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(eyebrow: "Settings", title: "Settings")
            Card {
                HStack(spacing: 16) {
                    AppMark(size: 58)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("HN Secure Network").font(Theme.font(17, .bold))
                        Text(AppInfo.label).font(Theme.font(13)).foregroundStyle(Theme.muted)
                        updateStatus.font(Theme.font(12, .semibold)).padding(.top, 2)
                    }
                    Spacer()
                    updateControl
                }
            }
            Card {
                VStack(alignment: .leading, spacing: 14) {
                    SectionHeading(title: "General", icon: "slider.horizontal.3")
                    Toggle(isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Open Secure Network when I log in").font(Theme.font(14, .semibold))
                            Text("The shield stays in the menu bar for quick access.").font(Theme.font(12)).foregroundStyle(Theme.muted)
                        }
                    }
                    .toggleStyle(.switch).tint(Theme.purple)
                }
            }
            Card {
                VStack(alignment: .leading, spacing: 14) {
                    SectionHeading(title: "Account", icon: "person.crop.circle")
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
            ZStack(alignment: .topLeading) {
                (model.connected ? Theme.heroOn : Theme.heroOff)
                Circle().fill(Theme.pink.opacity(model.connected ? 0.25 : 0.06)).frame(width: 160).blur(radius: 50).offset(x: 180, y: -40)
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 8) {
                        AppMark(size: 24)
                        Text("Secure Network").font(Theme.font(13, .heavy)).foregroundStyle(.white)
                        Spacer()
                        if model.stage == .ready, let user = model.user { AvatarView(image: model.avatar, name: user.displayName, size: 24) }
                    }
                    if model.stage == .ready && model.isSetUp {
                        HStack(spacing: 16) {
                            Button { Task { await model.toggle() } } label: { Orb(on: model.connected, busy: model.busy, size: 86) }
                                .buttonStyle(.plain).disabled(model.busy)
                                .accessibilityLabel(model.connected ? "Disconnect" : "Connect")
                            VStack(alignment: .leading, spacing: 3) {
                                Text(model.connected ? "Protected" : "Not protected").font(Theme.font(19, .heavy)).foregroundStyle(.white)
                                Text(model.connected ? (model.ip?.ip ?? "Through HN Group") : "Click to connect").font(Theme.font(12)).foregroundStyle(.white.opacity(0.65))
                                if model.connected { Text("United Kingdom").font(Theme.font(11, .semibold)).foregroundStyle(Theme.green) }
                            }
                        }
                    } else {
                        Text(model.stage == .ready ? "Finish setting up this Mac in the app." : "Sign in to use the VPN.")
                            .font(Theme.font(13)).foregroundStyle(.white.opacity(0.75))
                    }
                }
                .padding(14)
            }
            .frame(height: model.stage == .ready && model.isSetUp ? 150 : 100)
            .clipped()
            HNStripe().frame(height: 3)
            VStack(alignment: .leading, spacing: 10) {
                if let release = model.update {
                    Button { open(.settings) } label: { Label("Version \(release.version) is ready to install", systemImage: "arrow.down.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(Theme.accent).font(Theme.font(12, .bold))
                }
                if model.stage == .ready && model.isSetUp {
                    Button { open(.ssh) } label: { Label("SSH to the server", systemImage: "terminal") }.buttonStyle(HNButtonStyle(primary: false, wide: true))
                }
                Button("Open Secure Network") { open(nil) }.buttonStyle(HNButtonStyle(wide: true))
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
        .frame(width: 310)
        .background(Theme.background)
        .foregroundStyle(Theme.text)
    }

    private func open(_ section: VPNModel.Section?) {
        if let section = section { model.show(section) }
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
    }
}

// MARK: - Screenshots (--snapshot <folder>), used by CI to check the design

@MainActor
enum Snapshots {
    static func sample(stage: VPNModel.Stage = .ready, setUp: Bool = true, connected: Bool = true, section: VPNModel.Section = .connection) -> VPNModel {
        let m = VPNModel(preview: true)
        m.stage = stage
        m.user = User(displayName: "Charlie Livsey", email: "charlie.livsey@hngroup.org.uk", admin: true, avatar: nil)
        m.isSetUp = setUp; m.connected = connected; m.section = section
        m.connectedSince = connected ? Date().addingTimeInterval(-754) : nil
        m.serverReachable = connected ? true : nil
        m.ip = IPInfo(ip: connected ? "217.154.34.205" : "86.12.40.118", viaVpn: connected)
        m.deviceName = "Charlie’s MacBook Pro"
        let devices = [Device(id: "a", name: "Charlie’s MacBook Pro", address: "10.88.0.2", connected: true, lastHandshake: ISO8601DateFormatter().string(from: Date())),
                       Device(id: "b", name: "iPhone", address: "10.88.0.3", connected: false, lastHandshake: nil)]
        m.devices = devices
        m.profile = Profile(user: m.user!, devices: devices, limit: 5,
                            sessions: [SignInEntry(id: "1", kind: "app", createdAt: "2026-10-19T09:12:00Z", lastUsedAt: "2026-10-19T16:40:00Z", appVersion: "2.3.0", current: true),
                                       SignInEntry(id: "2", kind: "web", createdAt: "2026-10-18T14:02:00Z", lastUsedAt: "2026-10-18T14:30:00Z", appVersion: nil, current: false)],
                            activity: [Activity(at: "2026-10-19T09:12:00Z", action: "sign-in.app", detail: nil), Activity(at: "2026-10-18T14:02:00Z", action: "device.add", detail: nil), Activity(at: "2026-10-18T13:58:00Z", action: "sign-in.web", detail: nil)])
        return m
    }

    static func render(to folder: URL) {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let pages: [(String, VPNModel, CGSize, Bool)] = [
            ("welcome", sample(stage: .signIn, setUp: false, connected: false), CGSize(width: 980, height: 660), false),
            ("connected", sample(), CGSize(width: 1040, height: 760), false),
            ("disconnected", sample(connected: false), CGSize(width: 1040, height: 760), false),
            ("setup", sample(setUp: false, connected: false), CGSize(width: 1040, height: 760), false),
            ("ssh", sample(section: .ssh), CGSize(width: 1040, height: 760), false),
            ("profile", sample(section: .profile), CGSize(width: 1040, height: 860), false),
            ("settings", sample(section: .settings), CGSize(width: 1040, height: 700), false),
        ]
        for dark in [true, false] {
            for (name, model, size, _) in pages {
                shoot(MainView().environmentObject(model), size: size, dark: dark, to: folder.appendingPathComponent("\(name)-\(dark ? "dark" : "light").png"))
            }
            let menuModel = sample()
            shoot(MenuView().environmentObject(menuModel), size: CGSize(width: 310, height: 330), dark: dark, to: folder.appendingPathComponent("menu-\(dark ? "dark" : "light").png"))
        }
    }

    static func shoot<V: View>(_ view: V, size: CGSize, dark: Bool, to url: URL) {
        let host = NSHostingView(rootView: view.frame(width: size.width, height: size.height))
        host.frame = CGRect(origin: .zero, size: size)
        let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        window.contentView = host
        window.setFrameOrigin(NSPoint(x: -20000, y: -20000))
        window.orderFrontRegardless()
        host.layoutSubtreeIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(1.2))
        guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
        host.cacheDisplay(in: host.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
        window.orderOut(nil)
    }
}
