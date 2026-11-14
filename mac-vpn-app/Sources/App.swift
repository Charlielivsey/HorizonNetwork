import SwiftUI
import AppKit
import ServiceManagement
import Darwin

/// HN Secure Access Terminal for HN Group staff: the HN Group VPN (a private link to the server) and
/// SSH to the server, in a full app window with a shield in the menu bar for quick access.
@main
struct HNGroupVPNApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = VPNModel.shared

    init() { Theme.registerFont() }

    var body: some Scene {
        Window("HN Secure Access Terminal", id: "main") {
            MainView().environmentObject(model)
        }
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .defaultPosition(.center)
        .defaultSize(width: 920, height: 640)
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Check for Updatesâ€¦") { Task { model.show(.settings); await model.checkForUpdate() } }
            }
        }

        MenuBarExtra {
            MenuView().environmentObject(model)
        } label: {
            MenuBarMark(connected: model.connected, busy: model.busy)
                .accessibilityLabel(model.busy ? "HN Secure Access Terminal: changing connection" : model.connected ? "HN Secure Access Terminal: connected" : "HN Secure Access Terminal: not connected")
                .help(model.busy ? "Changing connectionâ€¦" : model.connected ? "HN Secure Access Terminal Â· Connected" : "HN Secure Access Terminal Â· Not connected")
        }
        .menuBarExtraStyle(.window)
    }
}

/// Receives hngroupvpn:// links, which bring the sign-in back from the browser.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        // App Manager invokes this fixed, non-secret setting only while this app is closed.
        // SMAppService must run inside the installed app whose login item is being changed.
        if let i = args.firstIndex(of: "--app-manager-login-item"), i + 1 < args.count {
            do {
                switch args[i + 1] {
                case "read": break
                case "true": try SMAppService.mainApp.register()
                case "false": try SMAppService.mainApp.unregister()
                default: throw NSError(domain: "HNAppManager", code: 1)
                }
                let enabled = SMAppService.mainApp.status == .enabled
                print(enabled ? "true" : "false")
                Darwin.exit(0)
            } catch {
                fputs("Unable to change the login item. Check macOS Login Items permissions.\n", stderr)
                Darwin.exit(1)
            }
        }
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
                // An AppKit image view, so animated profile pictures (GIFs) play as they do in the staff portal.
                AnimatedImage(image: image)
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

/// Shows an image filling its frame (cropped to fit), playing it if it's animated.
struct AnimatedImage: NSViewRepresentable {
    let image: NSImage
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    final class FillView: NSView {
        let imageView = NSImageView()
        override init(frame: NSRect) {
            super.init(frame: frame)
            wantsLayer = true
            layer?.masksToBounds = true
            imageView.imageScaling = .scaleProportionallyUpOrDown
            imageView.imageFrameStyle = .none
            imageView.isEditable = false
            addSubview(imageView)
        }
        required init?(coder: NSCoder) { fatalError() }
        override func layout() {
            super.layout()
            // Grow the image view past the edges so the picture fills the circle without stretching.
            let size = imageView.image?.size ?? bounds.size
            guard size.width > 0, size.height > 0 else { imageView.frame = bounds; return }
            let scale = max(bounds.width / size.width, bounds.height / size.height)
            let w = size.width * scale, h = size.height * scale
            imageView.frame = NSRect(x: (bounds.width - w) / 2, y: (bounds.height - h) / 2, width: w, height: h)
        }
    }

    func makeNSView(context: Context) -> FillView { FillView() }
    func updateNSView(_ view: FillView, context: Context) {
        if view.imageView.image !== image { view.imageView.image = image; view.needsLayout = true }
        view.imageView.animates = !reduceMotion
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
        guard let d = date(s) else { return "â€”" }
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
    @ObservedObject var gate = DeviceGate.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack(alignment: .top) {
            Group {
                if !gate.allowed { DeviceGateView(gate: gate).transition(.opacity) }
                else { switch model.stage {
                case .signIn, .waiting: WelcomeView().transition(.opacity)
                case .ready: SignedInView().transition(.opacity)
                } }
            }
            .animation(.easeInOut(duration: 0.3), value: model.stage)
            .animation(.easeInOut(duration: 0.3), value: gate.allowed)
            if gate.allowed, model.stage == .ready, model.pinRequest != nil { PinSheet() }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.34, dampingFraction: 0.86), value: model.pinRequest)
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
            Glow(color: (on ? Theme.violet : Theme.purple).opacity(on ? 0.6 : 0.22), size: size * 1.3)
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
                Glow(color: Theme.pink.opacity(0.18), size: 260).offset(x: -90, y: -160)
                Glow(color: Theme.teal.opacity(0.18), size: 240).offset(x: 110, y: 170)
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
                HNWordmark(height: 44)
                if model.stage == .waiting {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            ProgressView().controlSize(.small)
                            Text("Finish signing in in your browser").font(Theme.font(26, .heavy)).tracking(-0.4)
                        }
                        Text("When HN Group Auth asks, allow your browser to open HN Secure Access Terminal. Youâ€™ll come straight back here.")
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
                        Text("Send all of this Macâ€™s internet traffic through HN Groupâ€™s private VPN, and open SSH sessions to the server with just your password.")
                            .foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(3)
                        VStack(alignment: .leading, spacing: 12) {
                            Feature(icon: "lock.fill", title: "Encrypted with WireGuard", text: "Modern, fast and audited.")
                            Feature(icon: "globe.europe.africa.fill", title: "All your traffic, protected", text: "Through HN Groupâ€™s UK server.")
                            Feature(icon: "terminal.fill", title: "SSH in one step", text: "Straight to the HN Group server.")
                        }
                        .padding(.vertical, 6)
                        Button { model.signIn() } label: { HStack(spacing: 8) { Text("Sign in with HN Group Auth"); Image(systemName: "arrow.up.right") } }
                            .buttonStyle(HNButtonStyle(wide: true))
                            .keyboardShortcut(.defaultAction)
                        Text("Your browser opens HN Group Auth. Youâ€™ll need your password and six-digit PIN.")
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

/// Signed in: the approved HN sidebar and the chosen page.
struct SignedInView: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 0) {
            Sidebar()
            Rectangle().fill(Theme.border.opacity(0.7)).frame(width: 1)
            ZStack(alignment: .topTrailing) {
                Glow(color: Theme.violet.opacity(0.10), size: 420).offset(x: 140, y: -160).allowsHitTesting(false)
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
                   title: "Secure Access Terminal \(release.version) is ready",
                   text: model.updateState == .downloading ? "Downloadingâ€¦" : model.updateState == .installing ? "Installingâ€¦ the app will reopen by itself." : "You have \(AppInfo.version). The update installs here, with no need to download the app again.",
                   action: ("Update now", { Task { await model.installUpdate() } }),
                   busy: model.updateState == .downloading || model.updateState == .installing)
        }
        if case .failed(let message) = model.updateState, model.section != .settings {
            Banner(kind: .error, icon: "exclamationmark.triangle.fill", title: message)
        }
        if model.needsReconfigure {
            Banner(kind: .info, icon: "arrow.triangle.2.circlepath", title: "Finish updating this Macâ€™s VPN connection",
                   text: "The VPN now carries all of this Macâ€™s internet traffic again. macOS will ask for your Mac password once.",
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
            HNWordmark(height: 38)
                .padding(.horizontal, 10).padding(.top, 48).padding(.bottom, 26)

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
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface2))
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
        .background(Theme.sidebar)
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
                    InfoTile(icon: "network", label: "Your traffic appears as", value: model.ip?.ip ?? "Checkingâ€¦",
                             note: model.ip.map { $0.viaVpn ? "HN Group VPN address" : "Your own connection" } ?? "", good: model.ip?.viaVpn == true)
                    InfoTile(icon: "mappin.and.ellipse", label: "Location", value: model.connected ? "United Kingdom" : "Where you are",
                             note: model.connected ? "HN Group's UK server" : "Connect to go through the UK", good: model.connected)
                    InfoTile(icon: "server.rack", label: "HN Group server", value: VPNModel.serverAddress,
                             note: !model.connected ? "Connect to reach it" : model.serverReachable == nil ? "Checkingâ€¦" : model.serverReachable == true ? "Reachable for SSH" : "Not answering yet",
                             good: model.serverReachable == true)
                    InfoTile(icon: "laptopcomputer", label: "This Mac", value: model.deviceName ?? "â€”", note: "Its key never leaves this Mac")
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
                        Badge(text: "Set up Â· step \(toolsDone ? 2 : 1) of 2")
                        Text("Letâ€™s get this Mac ready").font(Theme.font(24, .heavy)).tracking(-0.4)
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
                        text: "The fast, secure open-source VPN behind Secure Access Terminal. This opens Terminal and installs it with Homebrew; come back here when it finishes.") {
                    Button("Install WireGuard tools") { model.installWireGuard() }.buttonStyle(HNButtonStyle())
                }
                StepRow(number: 2, done: false, active: toolsDone, title: "Set up this Mac",
                        text: "Registers this Mac with a key that never leaves it. While itâ€™s on, all of this Macâ€™s traffic will use the VPN. macOS asks for your Mac password once.") {
                    Button { Task { await model.setUp() } } label: {
                        HStack(spacing: 8) { if model.busy { ProgressView().controlSize(.small) }; Text(model.busy ? "Setting upâ€¦" : "Set up this Mac") }
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
        HStack(spacing: 28) {
            Button { Task { await model.toggle() } } label: { Orb(on: model.connected, busy: model.busy, size: 184) }
                .buttonStyle(.plain)
                .disabled(model.busy)
                .accessibilityLabel(model.connected ? "Disconnect" : "Connect")

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Circle().fill(model.connected ? Theme.green : Color.white.opacity(0.4)).frame(width: 8, height: 8)
                        .shadow(color: model.connected ? Theme.green : .clear, radius: 6)
                    Text(model.busy ? "WORKINGâ€¦" : model.connected ? "PROTECTED" : "NOT PROTECTED").font(Theme.font(11, .heavy)).tracking(1.6)
                }
                .foregroundStyle(Color.white.opacity(0.75))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(Color.white.opacity(0.08)))
                Text(model.connected ? "Youâ€™re protected" : "Youâ€™re not protected").font(Theme.font(30, .heavy)).tracking(-0.8).foregroundStyle(.white)
                    .lineLimit(1).minimumScaleFactor(0.75)
                Text(model.connected ? "All of this Macâ€™s internet traffic is encrypted and going through HN Groupâ€™s UK server." : "Turn on the VPN to encrypt alß½µ¶‰žËkºwµçU^
^
K™›Û
[YK™›Û
LK˜›Û
JBˆBˆ™›Ü™YÜ›Ý[™Ý[JÚ]K›ÜXÚ]JÍJJBˆœY[™ÊšÜš^›Û[JKœY[™Ê™\XØ[
Bˆ˜˜XÚÙÜ›Ý[™
Ø\Ý[J
K™š[
ÛÛÜ‹Ú]K›ÜXÚ]JŒÊJJBˆBŸB‚œÝXÝÚ\ˆšY]ÈÂˆ]XÛÛŽˆÝš[™Âˆ]^ˆÝš[™Âˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆÝXÚÊÜXÚ[™ÎˆÊHÂˆ[XYÙJÞ\Ý[S˜[YNˆXÛÛŠK™›Û
œÞ\Ý[JÚ^™NˆLKÙZYÚˆ˜›Û
JK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
Bˆ^
^
K™›Û
[YK™›Û
L‹œÙ[ZX›Û
JK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
BˆBˆœY[™ÊšÜš^›Û[LŠKœY[™Ê™\XØ[
Bˆ˜˜XÚÙÜ›Ý[™
Ø\Ý[J
K™š[
[YKœÝ\™˜XÙJJBˆ›Ý™\›^JØ\Ý[J
KœÝ›ÚÙP›Ü™\Š[YK˜›Ü™\‹›ÜXÚ]JŽ
JJBˆBŸB‚œÝXÝšY[›ÝÏšY[ˆšY]ÏŽˆšY]ÈÂˆ]X™[ˆÝš[™ÂˆšY]ÐZ[\ˆ˜\ˆšY[ˆšY[ˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆŠHÂˆ^
X™[
K™›Û
[YK™›Û
L‹˜›Û
JK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
BˆšY[ˆBˆBŸB‚œÝXÝ‘šY[Ý[Nˆ^šY[Ý[HÂˆ[˜ÈØ›ÙJÛÛ™šYÝ\˜][ÛŽˆ^šY[Ù[‹—ÓX™[ŠHOˆÛÛYHšY]ÈÂˆÛÛ™šYÝ\˜][Û‚ˆ^šY[Ý[JœZ[ŠBˆœY[™ÊšÜš^›Û[LŠKœY[™Ê™\XØ[L
Bˆ˜˜XÚÙÜ›Ý[™
›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆLÝ[Nˆ˜ÛÛ[[Ý\ÊK™š[
[YKœÝ\™˜XÙLŠJBˆ›Ý™\›^J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆLÝ[Nˆ˜ÛÛ[[Ý\ÊKœÝ›ÚÙP›Ü™\Š[YK˜›Ü™\ŠJBˆBŸB‚‹ËÈPT’ÎˆH›Ùš[B‚œÝXÝ›Ùš[TYÙNˆšY]ÈÂˆ[š\›Û›Y[Øš™XÝ˜\ˆ[Ù[ˆ”“[Ù[ˆš]˜]H]X™[ÈHÈœÚYÛ‹Z[‹ÙXˆŽˆ”ÚYÛ™Y[ˆÛˆHÙXœÚ]H‹œÚYÛ‹Z[‹˜\Žˆ”ÚYÛ™Y[ˆÈÙXÝ\™HXØÙ\ÜÈ\›Z[˜[‹œÚYÛ‹[Ý]›Ý\ˆŽˆ”ÚYÛ™YÝ][›Ý\ˆÚYÛ‹Z[ˆ‹ˆ™]šXÙK˜YŽˆYYH]šXÙH‹™]šXÙKœ™[[Ý™HŽˆ”™[[Ý™YH]šXÙH‹›XXËX\œX›\ÚŽˆ”X›\ÚYHÙXÝ\™HXØÙ\ÜÈ\›Z[˜[Z[—Bˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆN
HÂˆËÈXY\ˆØ\™Ú]Hœ˜[™˜[›™\‹‚ˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™Îˆ
HÂˆ”ÝXÚÈÂˆ[YKš\›ÓÛ‚ˆÛÝÊÛÛÜŽˆ[YKœ[šË›ÜXÚ]JŒŽ
KÚ^™Nˆ
K›Ù™œÙ]
ˆNˆLÌ
BˆÛÝÊÛÛÜŽˆ[YKX[›ÜXÚ]JŒŒŠKÚ^™NˆŒ
K›Ù™œÙ]
ˆMŒNˆL
BˆBˆ™œ˜[YJZYÚˆL
Bˆ™œ˜[YJX^ÚYˆš[™š[š]JBˆ˜Û\Y

BˆÝXÚÊ[YÛ›Y[ˆÜÜXÚ[™ÎˆŒ
HÂˆ]˜]\•šY]Ê[XYÙNˆ[Ù[˜]˜]\‹˜[YNˆ[Ù[\Ù\Ë™\Ü^S˜[YHÏÈˆ‹Ú^™NˆL
BˆœY[™ÊJBˆ˜˜XÚÙÜ›Ý[™
Ú\˜ÛJ
K™š[
[YKœÝ\™˜XÙJJBˆœÚYÝÊÛÛÜŽˆ[YKœ\œK›ÜXÚ]JŒŽ
K˜Y]\ÎˆMNˆŠBˆ›Ù™œÙ]
NˆMLŠKœY[™Ê˜›ÝÛKMLŠBˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™Îˆ
HÂˆ^
[Ù[\Ù\Ë™\Ü^S˜[YHÏÈˆŠK™›Û
[YK™›Û
‹šX]žJJK˜XÚÚ[™ÊLJK›[™S[Z]
JK›Z[š[][TØØ[Q˜XÝÜŠÊBˆ^
[Ù[\Ù\Ë™[XZ[ÏÈˆŠK™›Û
[YK™›Û
M
JK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
K›[™S[Z]
JK[˜Ø][Û“[ÙJ›ZYJBˆÝXÚÊÜXÚ[™Îˆ
HÂˆ[
XÛÛŽˆ[Ù[\Ù\Ë˜YZ[ˆOHYHÈ˜ÚXÚÛX\šËœÚY[™š[ˆˆœ\œÛÛ‹™š[‹ˆ^ˆ[Ù[\Ù\Ë˜YZ[ˆOHYHÈ•”ˆYZ[š\Ý˜]Üˆˆˆ’ˆÜ›Ý\ÝY™ˆ‹ÛÛÝ\Žˆ[YK˜XØÙ[
BˆYˆ]H[Ù[œ›Ùš[HÈ[
XÛÛŽˆ›\ÜÛÛ\]\ˆ‹^ˆ—
™]šXÙ\Ë˜ÛÝ[
HÙˆ
›[Z]
H]šXÙ\È‹ÛÛÝ\Žˆ[YKœÝXØÙ\ÜÊHBˆBˆœY[™ÊÜ
BˆBˆœY[™ÊÜM
BˆÜXÙ\ŠZ[“[™Ýˆ
BˆBˆœY[™ÊšÜš^›Û[
KœY[™Ê˜›ÝÛKŒŠBˆBˆ˜˜XÚÙÜ›Ý[™
›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\Îˆ[YKœ˜Y]\ËÝ[Nˆ˜ÛÛ[[Ý\ÊK™š[
[YKœÝ\™˜XÙJJBˆ˜Û\Ú\J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\Îˆ[YKœ˜Y]\ËÝ[Nˆ˜ÛÛ[[Ý\ÊJBˆ›Ý™\›^J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\Îˆ[YKœ˜Y]\ËÝ[Nˆ˜ÛÛ[[Ý\ÊKœÝ›ÚÙP›Ü™\Š[YK˜›Ü™\‹›ÜXÚ]JŽ
JJBˆœÚYÝÊÛÛÜŽˆ˜›XÚË›ÜXÚ]JŒJK˜Y]\ÎˆLNˆ
Bˆ^
–[Ý\ˆ˜[YH[™ÝÈÛÛYHœ›ÛH[Ý\ˆˆÜ›Ý\ÝY™ˆ›Ùš[KˆÚ[™ÙH[H[ˆHÝY™ˆÜ[Üˆˆœ›ÝÜÙ\‹ˆŠBˆ™›Û
[YK™›Û
LŠJK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
B‚ˆYˆ]H[Ù[œ›Ùš[HÂˆØ\™Âˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆL
HÂˆÙXÝ[Û’XY[™Ê]Nˆ•Ú\™H[Ýx &\™HÚYÛ™Y[ˆ‹XÛÛŽˆšÙ^K™š[ŠBˆ›Ü‘XXÚ
œÙ\ÜÚ[ÛœÊHÈÈ[‚ˆ\Ý›ÝÊXÛÛŽˆËšÚ[™OH˜\ˆÈ›\ÜÛÛ\]\ˆˆˆ™ÛØ™H‹ˆ]Nˆ
ËšÚ[™OH˜\ˆÈ”ÙXÝ\™HXØÙ\ÜÈ\›Z[˜[ˆ
È
Ë˜\™\œÚ[Û‹›X\Èˆˆ
È	HÏÈˆŠHˆ•ÙXœÚ]HŠH
È
Ë˜Ý\œ™[Èˆ0­È\ÈXXÈˆˆˆŠKˆÝX]Nˆ”ÚYÛ™Y[ˆ
Ú[‹œÚÜ
Ë˜Ü™X]Y]
JH0­È\Ý\ÙY
Ú[‹œÚÜ
Ë›\Ý\ÙY]
JHŠHÂˆYˆË˜Ý\œ™[È˜YÙJ^ˆÝ\œ™[‹ÛÛÝ\Žˆ[YKœÝXØÙ\ÜÊHBˆ[ÙHÈ]ÛŠ”ÚYÛˆÝ]ŠHÈ\ÚÈÈ]ØZ][Ù[™[™ÚYÛ’[ŠÊHHK˜]Û”Ý[J]Û”Ý[Jš[X\žNˆ˜[ÙJJHBˆBˆBˆBˆBˆØ\™Âˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆL
HÂˆÝXÚÈÂˆÙXÝ[Û’XY[™Ê]Nˆ–[Ý\ˆ]šXÙ\È‹XÛÛŽˆ›\ÜÛÛ\]\‹˜[™š\Û™HŠBˆÜXÙ\Š
Bˆ]ÛŠ“X[˜YÙHÛˆHÙXˆŠHÈ”ÕÛÜšÜÜXÙKœÚ\™Y›Ü[ŠTK˜˜\ÙJHK˜]Û”Ý[JœZ[ŠK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
K™›Û
[YK™›Û
L‹˜›Û
JBˆBˆYˆ™]šXÙ\Ëš\Ñ[\HÈ^
“›È]šXÙ\ÈY]ˆŠK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
HBˆ›Ü‘XXÚ
™]šXÙ\ÊHÈ[‚ˆ\Ý›ÝÊXÛÛŽˆ›˜[YKœ˜[™ÙJÙŽˆ›XXß›ÛÚß\Ü‹Ü[ÛœÎˆËœ™YÝ[\‘^™\ÜÚ[Û‹˜Ø\ÙR[œÙ[œÚ]]™WJHOHš[È›\ÜÛÛ\]\ˆˆˆš\Û™H‹ˆ]Nˆ›˜[YKÝX]Nˆ˜Y™\ÜÊHÂˆ˜YÙJ^ˆÚ[‹˜YÛÊ›\Ý[™ÚZÙJKÛÛÝ\Žˆ˜ÛÛ›™XÝYOHYHÈ[YKœÝXØÙ\ÜÈˆ[YK›]]Y
BˆBˆBˆBˆBˆØ\™Âˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™Îˆ
HÂˆÙXÝ[Û’XY[™Ê]Nˆ”™XÙ[XÝ]š]H‹XÛÛŽˆ˜ÛØÚË˜\œ›ÝË˜Ú\˜Û\]ŠKœY[™Ê˜›ÝÛK
BˆYˆ˜XÝ]š]Kš\Ñ[\HÈ^
“›Ý[™ÈY]ˆŠK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
HBˆ›Ü‘XXÚ
\œ˜^J˜XÝ]š]K™[[Y\˜]Y

JKYˆ›Ù™œÙ]
HÈKH[‚ˆÝXÚÊ[YÛ›Y[ˆÜÜXÚ[™ÎˆM
HÂˆ”ÝXÚÊÜXÚ[™Îˆ
HÂˆÚ\˜ÛJ
K™š[
[YK˜œ˜[™
K™œ˜[YJÚYˆLZYÚˆL
K›Ý™\›^JÚ\˜ÛJ
KœÝ›ÚÙJ[YK˜XØÙ[ÛÙ[™UÚYˆÊJBˆYˆH˜XÝ]š]K˜ÛÝ[HHÈ™XÝ[™ÛJ
K™š[
[YK˜›Ü™\ŠK™œ˜[YJÚYˆŠK™œ˜[YJX^ZYÚˆš[™š[š]JHBˆBˆ™œ˜[YJÚYˆLŠBˆ^
X™[ÖØK˜XÝ[Û—HÏÈK˜XÝ[ÛŠK™›Û
[YK™›Û
LË›YY][JJKœY[™Ê˜›ÝÛKM
BˆÜXÙ\Š
Bˆ^
Ú[‹œÚÜ
K˜]
JK™›Û
[YK™›Û
LŠJK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
BˆBˆBˆBˆBˆH[ÙHÂˆÝXÚÈÈÜXÙ\Š
NÈ›ÙÜ™\ÜÕšY]Ê
NÈÜXÙ\Š
HKœY[™Ê
BˆBˆBˆBŸB‚‹ËËÈH™XYX›HX™[Y[ˆ[ˆXÛÛˆ[™Ù[[˜ÙKXØ\ÙH^ÛˆHÛÙ[™]™\ˆÜ˜\[™Ë‚œÝXÝ[ˆšY]ÈÂˆ]XÛÛŽˆÝš[™Âˆ]^ˆÝš[™Âˆ˜\ˆÛÛÝ\ŽˆÛÛÜˆH[YK˜XØÙ[ˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆÝXÚÊÜXÚ[™ÎˆŠHÂˆ[XYÙJÞ\Ý[S˜[YNˆXÛÛŠK™›Û
œÞ\Ý[JÚ^™NˆLKÙZYÚˆ˜›Û
JBˆ^
^
K™›Û
[YK™›Û
L‹K˜›Û
JBˆBˆ™›Ü™YÜ›Ý[™Ý[JÛÛÝ\ŠBˆ›[™S[Z]
JK™š^YÚ^™J
BˆœY[™ÊšÜš^›Û[LJKœY[™Ê™\XØ[ŠBˆ˜˜XÚÙÜ›Ý[™
Ø\Ý[J
K™š[
ÛÛÝ\‹›ÜXÚ]JŒM
JJBˆ›Ý™\›^JØ\Ý[J
KœÝ›ÚÙP›Ü™\ŠÛÛÝ\‹›ÜXÚ]JŒÊJJBˆBŸB‚œÝXÝÙXÝ[Û’XY[™ÎˆšY]ÈÂˆ]]NˆÝš[™Âˆ]XÛÛŽˆÝš[™Âˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆÝXÚÊÜXÚ[™Îˆ
HÂˆ[XYÙJÞ\Ý[S˜[YNˆXÛÛŠK™›Û
œÞ\Ý[JÚ^™NˆL‹ÙZYÚˆ˜›Û
JK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
Bˆ^
]JK™›Û
[YK™›Û
M‹˜›Û
JBˆBˆœY[™Ê˜›ÝÛKŠBˆBŸB‚œÝXÝ\Ý›ÝÏ˜Z[[™ÎˆšY]ÏŽˆšY]ÈÂˆ]XÛÛŽˆÝš[™Âˆ]]NˆÝš[™Âˆ]ÝX]NˆÝš[™ÂˆšY]ÐZ[\ˆ˜\ˆ˜Z[[™Îˆ˜Z[[™ÂˆÝ]Hš]˜]H˜\ˆÝ™\ˆH˜[ÙBˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆÝXÚÊÜXÚ[™ÎˆLŠHÂˆ[XYÙJÞ\Ý[S˜[YNˆXÛÛŠK™›Û
œÞ\Ý[JÚ^™NˆMKÙZYÚˆ›YY][JJK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
Bˆ™œ˜[YJÚYˆÎZYÚˆÎ
K˜˜XÚÙÜ›Ý[™
›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆLKÝ[Nˆ˜ÛÛ[[Ý\ÊK™š[
[YK˜XØÙ[ÛÙ
JBˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆŠHÂˆ^
]JK™›Û
[YK™›Û
M˜›Û
JK›[™S[Z]
JBˆ^
ÝX]JK™›Û
[YK™›Û
LŠJK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
K›[™S[Z]
JBˆBˆÜXÙ\ŠZ[“[™Ýˆ
Bˆ˜Z[[™ÂˆBˆœY[™ÊLŠBˆ˜˜XÚÙÜ›Ý[™
›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆMÝ[Nˆ˜ÛÛ[[Ý\ÊK™š[
Ý™\ˆÈ[YKœÝ\™˜XÙLˆˆ[YKœÝ\™˜XÙL‹›ÜXÚ]JŠJJBˆ›Ý™\›^J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆMÝ[Nˆ˜ÛÛ[[Ý\ÊKœÝ›ÚÙP›Ü™\Š[YK˜›Ü™\‹›ÜXÚ]JÊJJBˆ˜[š[X][ÛŠ™X\ÙSÝ]
\˜][ÛŽˆŒMJK˜[YNˆÝ™\ŠBˆ›Û’Ý™\ˆÈÝ™\ˆH	BˆBŸB‚‹ËÈPT’ÎˆHÙ][™ÜÂ‚œÝXÝÙ][™ÜÔYÙNˆšY]ÈÂˆ[š\›Û›Y[Øš™XÝ˜\ˆ[Ù[ˆ”“[Ù[ˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆN
HÂˆYÙU]J^YXœ›ÝÎˆ”Ù][™ÜÈ‹]Nˆ”Ù][™ÜÈŠBˆØ\™ÂˆÝXÚÊÜXÚ[™ÎˆMŠHÂˆ\X\šÊÚ^™NˆN
Bˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆÊHÂˆ^
’ˆÙXÝ\™HXØÙ\ÜÈ\›Z[˜[ŠK™›Û
[YK™›Û
MË˜›Û
JBˆ^
\[™›Ë›X™[
K™›Û
[YK™›Û
LÊJK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
Bˆ\]TÝ]\Ë™›Û
[YK™›Û
L‹œÙ[ZX›Û
JKœY[™ÊÜŠBˆBˆÜXÙ\Š
Bˆ\]PÛÛ›ÛˆBˆBˆØ\™Âˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆM
HÂˆÙXÝ[Û’XY[™Ê]Nˆ‘Ù[™\˜[‹XÛÛŽˆœÛY\‹šÜš^›Û[ŒÈŠBˆÙÙÛJ\ÓÛŽˆš[™[™ÊÙ]ˆÈ[Ù[›][˜Ú]ÙÚ[ˆKÙ]ˆÈ[Ù[œÙ]][˜Ú]ÙÚ[Š	
HJJHÂˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆŠHÂˆ^
“Ü[ˆÙXÝ\™HXØÙ\ÜÈ\›Z[˜[Ú[ˆHÙÈ[ˆŠK™›Û
[YK™›Û
MœÙ[ZX›Û
JBˆ^
•HÚY[Ý^\È[ˆHY[H˜\ˆ›Üˆ]ZXÚÈXØÙ\ÜËˆŠK™›Û
[YK™›Û
LŠJK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
BˆBˆBˆÙÙÛTÝ[JœÝÚ]Ú
K[
[YKœ\œJBˆBˆBˆØ\™Âˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆM
HÂˆÙXÝ[Û’XY[™Ê]NˆXØÛÝ[‹XÛÛŽˆœ\œÛÛ‹˜Ü›Ü˜Ú\˜ÛHŠBˆÝXÚÊÜXÚ[™ÎˆL
HÂˆ]ÛŠ“X[˜YÙH]šXÙ\ÈÛˆHÙXˆŠHÈ”ÕÛÜšÜÜXÙKœÚ\™Y›Ü[ŠTK˜˜\ÙJHK˜]Û”Ý[J]Û”Ý[Jš[X\žNˆ˜[ÙJJBˆ]ÛŠ”™Yœ™\ÚŠHÈ\ÚÈÈ]ØZ][Ù[œ™Yœ™\Ú

HHK˜]Û”Ý[J]Û”Ý[Jš[X\žNˆ˜[ÙJJBˆÜXÙ\Š
Bˆ]ÛŠ”ÚYÛˆÝ]ŠHÈ\ÚÈÈ]ØZ][Ù[œÚYÛ“Ý]

HHK˜]Û”Ý[J]Û”Ý[Jš[X\žNˆ˜[ÙJJBˆš[
‘\ØÛÛ›™XÝÈ[™™[[Ý™\È\ÈXXÈœ›ÛHH”‹ˆŠBˆBˆ^
”ÚYÛš[™ÈÝ]\ØÛÛ›™XÝÈ[™™[[Ý™\È\ÈXXÈœ›ÛHH”‹ˆŠK™›Û
[YK™›Û
LŠJK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
BˆBˆBˆBˆB‚ˆšY]ÐZ[\ˆš]˜]H˜\ˆ\]PÛÛ›ÛˆÛÛYHšY]ÈÂˆYˆ[Ù[\]HOHš[Âˆ]ÛŠ•\]H›ÝÈŠHÈ\ÚÈÈ]ØZ][Ù[š[œÝ[\]J
HHK˜]Û”Ý[J]Û”Ý[J
JBˆ™\ØX›Y
[Ù[\]TÝ]HOH™ÝÛ›ØY[™È[Ù[\]TÝ]HOHš[œÝ[[™ÊBˆH[ÙHÂˆ]ÛŠÚXÚÈ›Üˆ\]\ÈŠHÈ\ÚÈÈ]ØZ][Ù[˜ÚXÚÑ›Ü•\]J
HHK˜]Û”Ý[J]Û”Ý[Jš[X\žNˆ˜[ÙJJBˆ™\ØX›Y
[Ù[\]TÝ]HOH˜ÚXÚÚ[™ÊBˆBˆB‚ˆšY]ÐZ[\ˆš]˜]H˜\ˆ\]TÝ]\ÎˆÛÛYHšY]ÈÂˆÝÚ]Ú[Ù[\]TÝ]HÂˆØ\ÙH˜ÚXÚÚ[™ÎˆX™[
ÚXÚÚ[™ø )ˆ‹Þ\Ý[R[XYÙNˆ˜\œ›ÝËšX[™ÛKŒ‹˜Ú\˜Û\]ŠK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
BˆØ\ÙH\Ñ]NˆX™[
–[ÝH]™HH]\Ý™\œÚ[Û‹ˆ‹Þ\Ý[R[XYÙNˆ˜ÚXÚÛX\šË˜Ú\˜ÛK™š[ŠK™›Ü™YÜ›Ý[™Ý[J[YKœÝXØÙ\ÜÊBˆØ\ÙH™ÝÛ›ØY[™ÎˆX™[
‘ÝÛ›ØY[™ÈH\]x )ˆ‹Þ\Ý[R[XYÙNˆ˜\œ›ÝË™ÝÛ‹˜Ú\˜ÛHŠK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
BˆØ\ÙHš[œÝ[[™ÎˆX™[
’[œÝ[[™ø )ˆH\Ú[™[Ü[ˆžH]Ù[‹ˆ‹Þ\Ý[R[XYÙNˆ™ÙX\œÚ\KŒˆŠK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
BˆØ\ÙH™˜Z[Y
]Y\ÜØYÙJNˆX™[
Y\ÜØYÙKÞ\Ý[R[XYÙNˆ™^Û[X][Û›X\šËšX[™ÛK™š[ŠK™›Ü™YÜ›Ý[™Ý[J[YK™[™Ù\ŠBˆØ\ÙHšYN‚ˆYˆ]™[X\ÙHH[Ù[\]HÈX™[
•™\œÚ[Ûˆ
™[X\ÙK™\œÚ[ÛŠH\È]˜Z[X›Kˆ‹Þ\Ý[R[XYÙNˆœÜ\šÛ\ÈŠK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
HBˆBˆBŸB‚‹ËÈPT’ÎˆHY[H˜\‚‚œÝXÝY[UšY]ÎˆšY]ÈÂˆ[š\›Û›Y[Øš™XÝ˜\ˆ[Ù[ˆ”“[Ù[ˆ[š\›Û›Y[
›Ü[•Ú[™ÝÊHš]˜]H˜\ˆÜ[•Ú[™ÝÂˆ[š\›Û›Y[
˜XØÙ\ÜÚXš[]T™YXÙS[Ý[ÛŠHš]˜]H˜\ˆ™YXÙS[Ý[Û‚ˆØœÙ\™YØš™XÝ˜\ˆØ]HH]šXÙQØ]KœÚ\™YˆÝ]XÈ]ÚYˆÑÑ›Ø]HÌŒ‚ˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆËÈ›Ý\›Ý™YÛˆ]šXÙ\Ëš™Ü›Ý\›Ü™ËZÎˆHY[HÛ›H^Z[œÈÚKÚ]HÛÙHÈY\ÈXXË‚ˆYˆYØ]K˜[ÝÙYÂˆ”ÝXÚÊÜXÚ[™Îˆ
HÂˆ”Ýš\J
K™œ˜[YJZYÚˆÊBˆ]šXÙQØ]UšY]ÊØ]NˆØ]KÛÛ\XÝˆYJBˆBˆ™œ˜[YJÚYˆÙ[‹ÚY
Bˆ™š^YÚ^™JÜš^›Û[ˆ˜[ÙK™\XØ[ˆYJBˆ˜˜XÚÙÜ›Ý[™
[YK˜˜XÚÙÜ›Ý[™
Bˆ™›Ü™YÜ›Ý[™Ý[J[YK^
BˆH[ÙHÂˆY[BˆBˆB‚ˆš]˜]H˜\ˆY[NˆÛÛYHšY]ÈÂˆ”ÝXÚÊÜXÚ[™Îˆ
HÂˆXY\‚ˆ”Ýš\J
K™œ˜[YJZYÚˆÊBˆ”ÝXÚÊÜXÚ[™Îˆ
HÂˆYˆ]™[X\ÙHH[Ù[\]HÂˆ]ÛˆÈÜ[ŠœÙ][™ÜÊHHX™[ˆÂˆX™[
•™\œÚ[Ûˆ
™[X\ÙK™\œÚ[ÛŠH\È™XYHÈ[œÝ[‹Þ\Ý[R[XYÙNˆ˜\œ›ÝË™ÝÛ‹˜Ú\˜ÛK™š[ŠBˆ™œ˜[YJX^ÚYˆš[™š[š]K[YÛ›Y[ˆ›XY[™ÊBˆBˆ˜]Û”Ý[JœZ[ŠK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
K™›Û
[YK™›Û
L‹˜›Û
JBˆœY[™Ê˜›ÝÛKŠBˆBˆYˆ[Ù[œÝYÙHOHœ™XYH	‰ˆ[Ù[š\ÔÙ]\Âˆ]ÛˆÈÜ[ŠœÜÚ
HHX™[ˆÈÝXÚÊÜXÚ[™Îˆ
HÈ[XYÙJÞ\Ý[S˜[YNˆ\›Z[˜[ŠNÈ^
”ÔÒÈHÙ\™\ˆŠHHBˆ˜]Û”Ý[J]Û”Ý[Jš[X\žNˆ˜[ÙKÚYNˆYJJBˆBˆ]ÛˆÈÜ[Šš[
HHX™[ˆÈ^
“Ü[ˆÙXÝ\™HXØÙ\ÜÈ\›Z[˜[ŠHK˜]Û”Ý[J]Û”Ý[JÚYNˆYJJBˆBˆœY[™ÊM
Bˆ™XÝ[™ÛJ
K™š[
[YK˜›Ü™\‹›ÜXÚ]JŽ
JK™œ˜[YJZYÚˆJBˆÝXÚÈÂˆ]ÛŠ•”ˆÙXœÚ]HŠHÈ”ÕÛÜšÜÜXÙKœÚ\™Y›Ü[ŠTK˜˜\ÙJHK˜]Û”Ý[JœZ[ŠK™›Ü™YÜ›Ý[™Ý[J[YK˜XØÙ[
BˆÜXÙ\Š
Bˆ]ÛŠ”]Z]ŠHÈ”Ð\XØ][Û‹œÚ\™Y\›Z[˜]Jš[
HK˜]Û”Ý[JœZ[ŠKšÙ^X›Ø\™ÚÜÝ]
œHŠBˆBˆ™›Û
[YK™›Û
L‹œÙ[ZX›Û
JBˆœY[™ÊšÜš^›Û[MŠKœY[™Ê™\XØ[LJBˆBˆËÈHš^YÚY[™HÛÛ[	ÜÈÝÛˆZYÚÛÈHY[H˜\ˆÚ[™ÝÈ\È[Ø^\ÈZYÝ]HØ[YHØ^K‚ˆ™œ˜[YJÚYˆÙ[‹ÚY
Bˆ™š^YÚ^™JÜš^›Û[ˆ˜[ÙK™\XØ[ˆYJBˆ˜˜XÚÙÜ›Ý[™
[YK˜˜XÚÙÜ›Ý[™
Bˆ™›Ü™YÜ›Ý[™Ý[J[YK^
BˆB‚ˆËËÈHÝ]\ÎˆHˆÜ›Ý\ÙÛËÚÉÜÈÚYÛ™Y[‹[™HÝÙ\ˆÝÚ]ÚÚ]HÛÛ›™XÝ[Ûˆ]Z[Ë‚ˆš]˜]H˜\ˆXY\ŽˆÛÛYHšY]ÈÂˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆM
HÂˆÝXÚÊÜXÚ[™Îˆ
HÂˆ•ÛÜ™X\šÊZYÚˆŒŠBˆÜXÙ\ŠZ[“[™Ýˆ
BˆYˆ[Ù[œÝYÙHOHœ™XYK]\Ù\ˆH[Ù[\Ù\ˆÂˆ]˜]\•šY]Ê[XYÙNˆ[Ù[˜]˜]\‹˜[YNˆ\Ù\‹™\Ü^S˜[YKÚ^™NˆŠBˆ›Ý™\›^JÚ\˜ÛJ
KœÝ›ÚÙP›Ü™\ŠÛÛÜ‹Ú]K›ÜXÚ]JŒJK[™UÚYˆJJBˆBˆBˆYˆ[Ù[œÝYÙHOHœ™XYH	‰ˆ[Ù[š\ÔÙ]\	‰ˆ[Ù[œ[”™\]Y\ÝOHš[Âˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆL
HÂˆ^
‘[\ˆ[Ý\ˆSˆÈÛÛ›™XÝŠK™›Û
[YK™›Û
M‹šX]žJJK™›Ü™YÜ›Ý[™Ý[JÚ]JBˆ[‘[žJÛÛ\XÝˆYJBˆÝXÚÈÂˆ^
[Ù[œ[‘\œ›ÜˆÏÈ–[Ý\ˆÚ^YYÚ]ˆÜ›Ý\SˆŠBˆ™›Û
[YK™›Û
LKœÙ[ZX›Û
JK™›Ü™YÜ›Ý[™Ý[J[Ù[œ[‘\œ›ÜˆOHš[ÈÛÛÜ‹Ú]K›ÜXÚ]JÊHˆÛÛÜŠ^ˆ‘Î
JBˆ™š^YÚ^™JÜš^›Û[ˆ˜[ÙK™\XØ[ˆYJBˆÜXÙ\ŠZ[“[™Ýˆ
Bˆ]ÛŠØ[˜Ù[ŠHÈ[Ù[˜Ø[˜Ù[[Š
HK˜]Û”Ý[JœZ[ŠK™›Û
[YK™›Û
L‹˜›Û
JK™›Ü™YÜ›Ý[™Ý[JÚ]K›ÜXÚ]JŽJJBˆBˆBˆ˜[œÚ][ÛŠ›ÜXÚ]JBˆH[ÙHYˆ[Ù[œÝYÙHOHœ™XYH	‰ˆ[Ù[š\ÔÙ]\ÂˆÝXÚÊÜXÚ[™ÎˆM
HÂˆ]ÛˆÈ\ÚÈÈ]ØZ][Ù[ÙÙÛJ
HHHX™[ˆÈÝÙ\”ÝÚ]Ú
ÛŽˆ[Ù[˜ÛÛ›™XÝY\ÞNˆ[Ù[˜\ÞJHBˆ˜]Û”Ý[JœZ[ŠK™\ØX›Y
[Ù[˜\ÞJBˆ˜XØÙ\ÜÚXš[]SX™[
[Ù[˜ÛÛ›™XÝYÈ‘\ØÛÛ›™XÝˆˆÛÛ›™XÝŠBˆ”ÝXÚÊ[YÛ›Y[ˆ›XY[™ËÜXÚ[™ÎˆÊHÂˆ^
[Ù[˜\ÞHÈ•ÛÜšÚ[™ø )ˆˆˆ[Ù[˜ÛÛ›™XÝYÈ”›ÝXÝYˆˆ“›Ý›ÝXÝYŠBˆ™›Û
[YK™›Û
NšX]žJJK™›Ü™YÜ›Ý[™Ý[JÚ]JBˆ^
[Ù[˜ÛÛ›™XÝYÈ
[Ù[š\Ëš\ÏÈ•›ÝYÚˆÜ›Ý\ŠHˆÛXÚÈÈÛÛ›™XÝŠBˆ™›Û
[YK™›Û
LŠJK™›Ü™YÜ›Ý[™Ý[JÚ]K›ÜXÚ]JÊJK›[™S[Z]
JBˆYˆ[Ù[˜ÛÛ›™XÝYÂˆX™[
•[š]YÚ[™ÙÛH‹Þ\Ý[R[XYÙNˆ›X\[‹˜Ú\˜ÛK™š[ŠBˆ™›Û
[YK™›Û
LKœÙ[ZX›Û
JK™›Ü™YÜ›Ý[™Ý[J[YK™Ü™Y[ŠBˆBˆBˆÜXÙ\ŠZ[“[™Ýˆ
BˆBˆH[ÙHÂˆ^
[Ù[œÝYÙHOHœ™XYHÈ‘š[š\ÚÙ][™È\\ÈXXÈ[ˆH\ˆˆˆ”ÚYÛˆ[ˆÈ\ÙHH”‹ˆŠBˆ™›Û
[YK™›Û
LÊJK™›Ü™YÜ›Ý[™Ý[JÚ]K›ÜXÚ]JŽ
JBˆ™š^YÚ^™JÜš^›Û[ˆ˜[ÙK™\XØ[ˆYJBˆBˆBˆœY[™ÊMŠBˆ™œ˜[YJÚYˆÙ[‹ÚY[YÛ›Y[ˆ›XY[™ÊBˆ˜˜XÚÙÜ›Ý[™
ˆ”ÝXÚÈÂˆ[Ù[˜ÛÛ›™XÝYÈ[YKš\›ÓÛˆˆ[YKš\›ÓÙ™‚ˆÛÝÊÛÛÜŽˆ[YKœ[šË›ÜXÚ]J[Ù[˜ÛÛ›™XÝYÈŒHˆŒ
KÚ^™NˆN
K›Ù™œÙ]
ˆLŒNˆM
BˆBˆ
Bˆ˜Û\Y

Bˆ™[š\›Û›Y[
˜ÛÛÜ”ØÚ[YK™\šÊBˆ˜[š[X][ÛŠ™YXÙS[Ý[ÛˆÈš[ˆ™X\ÙR[“Ý]
\˜][ÛŽˆŒÊK˜[YNˆ[Ù[˜ÛÛ›™XÝY
Bˆ˜[š[X][ÛŠ™YXÙS[Ý[ÛˆÈš[ˆ™X\ÙSÝ]
\˜][ÛŽˆŒŠK˜[YNˆ[Ù[œ[”™\]Y\Ý
BˆB‚ˆš]˜]H[˜ÈÜ[ŠÈÙXÝ[ÛŽˆ”“[Ù[”ÙXÝ[ÛÊHÂˆYˆ]ÙXÝ[ÛˆHÙXÝ[ÛˆÈ[Ù[œÚÝÊÙXÝ[ÛŠHBˆÜ[•Ú[™ÝÊYˆ›XZ[ˆŠBˆ”Ð\˜XÝ]˜]JYÛ›Üš[™ÓÝ\\ÎˆYJBˆBŸB‚‹ËÈPT’ÎˆHSˆ™Y›Ü™HÛÛ›™XÝ[™Â‚‹ËËÈÚ^X\ÚÙY›Þ\È›ÜˆHˆÜ›Ý\S‹ˆ\[™ÈHÚ^YÚ]ÚXÚÜÈ]Û˜ÙNÈHÜ›Û™ÈSˆÚZÙ\Â‹ËËÈH›Þ\È[™ÛX\œÈ[KˆÛ™HY[ˆšY[ZÙ\ÈH\[™È
[™\Ý[™ÊHÛÈH›Þ\ÈÝ^HÚ[\K‚œÝXÝ[‘[žNˆšY]ÈÂˆ[š\›Û›Y[Øš™XÝ˜\ˆ[Ù[ˆ”“[Ù[ˆ˜\ˆÛÛ\XÝH˜[ÙBˆÝ]Hš]˜]H˜\ˆÛÙHHˆ‚ˆÝ]Hš]˜]H˜\ˆÚZÙ\ÎˆÑÑ›Ø]Hˆ›ØÝ\ÔÝ]Hš]˜]H˜\ˆ›ØÝ\ÙYˆ›ÛÛˆ[š\›Û›Y[
˜XØÙ\ÜÚXš[]T™YXÙS[Ý[ÛŠHš]˜]H˜\ˆ™YXÙS[Ý[Û‚‚ˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆ”ÝXÚÈÂˆÙXÝ\™QšY[
ˆ‹^ˆ	ÛÙJBˆ^šY[Ý[JœZ[ŠBˆ™›ØÝ\ÙY
	›ØÝ\ÙY
Bˆ™œ˜[YJÚYˆKZYÚˆJK›ÜXÚ]JŒJBˆ˜XØÙ\ÜÚXš[]SX™[
”Ú^YYÚ]SˆŠBˆ›ÛÚ[™ÙJÙŽˆÛÙJHÈ\Y[‚ˆ]YÚ]ÈHÝš[™Ê\Y™š[\ˆÈ	š\ÐTÐÒRH	‰ˆ	š\Ó[X™\ˆKœ™Yš^
ŠJBˆYˆYÚ]ÈOH\YÈÛÙHHYÚ]ÎÈ™]\›ˆBˆYˆYÚ]Ë˜ÛÝ[OHˆ	‰ˆ[[Ù[œ[\ÞHÈ\ÚÈÈ]ØZ][Ù[œÝX›Z][ŠYÚ]ÊHHBˆBˆÝXÚÊÜXÚ[™ÎˆÛÛ\XÝÈÈˆL
HÂˆ›Ü‘XXÚ
‹‹YˆœÙ[ŠHÈH[ˆ›Þ
JHBˆBˆ˜ÛÛ[Ú\J™XÝ[™ÛJ
JBˆ›Û•\Ù\Ý\™HÈ›ØÝ\ÙYHYHBˆBˆ›[ÙYšY\ŠÚZÙJ[[Ý[ˆÚZÙ\ÊJBˆ›ÜXÚ]J[Ù[œ[\ÞHÈˆˆJBˆ›Û\X\ˆÈÛÙHHˆŽÈ›ØÝ\ÙYHYNÈ\Ü]Ú]Y]YK›XZ[‹˜\Þ[˜ÈÈ›ØÝ\ÙYHYHHBˆ›ÛÚ[™ÙJÙŽˆ[Ù[œ[‘\œ›ÜŠHÈY\ÜØYÙH[‚ˆÝX\™Y\ÜØYÙHOHš[[ÙHÈ™]\›ˆBˆÛÙHHˆŽÈ›ØÝ\ÙYHYBˆYˆ\™YXÙS[Ý[ÛˆÈÚ][š[X][ÛŠ›[™X\Š\˜][ÛŽˆ
JHÈÚZÙ\È
ÏHHHBˆBˆB‚ˆš]˜]H[˜È›Þ
ÈNˆ[
HOˆÛÛYHšY]ÈÂˆ]š[YHHÛÙK˜ÛÝ[Ý\œ™[H›ØÝ\ÙY	‰ˆHOHZ[ŠÛÙK˜ÛÝ[JH	‰ˆ[[Ù[œ[\ÞBˆ]Ú^™NˆÑÑ›Ø]HÛÛ\XÝÈÎˆˆ™]\›ˆ›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆÛÛ\XÝÈLˆL‹Ý[Nˆ˜ÛÛ[[Ý\ÊBˆ™š[
ÛÛ\XÝÈÛÛÜ‹Ú]K›ÜXÚ]Jš[YÈŒNˆŒ
Hˆ
š[YÈ[YK˜XØÙ[ÛÙˆ[YKœÝ\™˜XÙLŠJBˆ›Ý™\›^J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆÛÛ\XÝÈLˆL‹Ý[Nˆ˜ÛÛ[[Ý\ÊBˆœÝ›ÚÙP›Ü™\ŠÝ\œ™[È[YKš[Û]ˆ
ÛÛ\XÝÈÛÛÜ‹Ú]K›ÜXÚ]JŒŒŠHˆ[YK˜›Ü™\ŠK[™UÚYˆÝ\œ™[ÈˆˆJJBˆ›Ý™\›^JÚ\˜ÛJ
K™š[
ÛÛ\XÝÈÛÛÜ‹Ú]Hˆ[YK˜XØÙ[
K™œ˜[YJÚYˆÛÛ\XÝÈHˆLKZYÚˆÛÛ\XÝÈHˆLJBˆœØØ[QY™™XÝ
š[YÈHˆŒŠK›ÜXÚ]Jš[YÈHˆ
JBˆ™œ˜[YJÚYˆÚ^™KZYÚˆÚ^™H
È
ÛÛ\XÝÈˆ
JBˆ˜[š[X][ÛŠ™YXÙS[Ý[ÛˆÈš[ˆœÜš[™Ê™\ÜÛœÙNˆŒK[\[™Ñœ˜XÝ[ÛŽˆÊK˜[YNˆš[Y
Bˆ˜[š[X][ÛŠ™YXÙS[Ý[ÛˆÈš[ˆ™X\ÙSÝ]
\˜][ÛŽˆŒMJK˜[YNˆÝ\œ™[
BˆBŸB‚‹ËËÈHÚÜÚYK]Ë\ÚYHÚZÙH›ÜˆHÜ›Û™ÈS‹‚œÝXÝÚZÙNˆÙ[ÛY]žQY™™XÝÂˆ˜\ˆ[[Ý[ˆÑÑ›Ø]ˆ˜\ˆ[š[X]X›Q]NˆÑÑ›Ø]ÈÙ]È[[Ý[HÙ]È[[Ý[H™]Õ˜[YHHBˆ[˜ÈY™™XÝ˜[YJÚ^™NˆÑÔÚ^™JHOˆ›Ú™XÝ[Û•˜[œÙ›Ü›HÂˆ›Ú™XÝ[Û•˜[œÙ›Ü›JÑÐY™š[™U˜[œÙ›Ü›J˜[œÛ][Û–ˆH
ˆÚ[Š[[Ý[
ˆœH
ˆŠKNˆ
JBˆBŸB‚‹ËËÈHÚ[™ÝÉÜÈSˆØ\™Ù[™YÝ™\ˆHYÚH[[YYYÙK‚œÝXÝ[”ÚY]ˆšY]ÈÂˆ[š\›Û›Y[Øš™XÝ˜\ˆ[Ù[ˆ”“[Ù[ˆ[š\›Û›Y[
˜XØÙ\ÜÚXš[]T™YXÙS[Ý[ÛŠHš]˜]H˜\ˆ™YXÙS[Ý[Û‚ˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆ”ÝXÚÈÂˆÛÛÜ‹˜›XÚË›ÜXÚ]JŒÌŠKšYÛ›Ü™\ÔØY™P\™XJ
K›Û•\Ù\Ý\™HÈYˆ[[Ù[œ[\ÞHÈ[Ù[˜Ø[˜Ù[[Š
HHBˆ˜[œÚ][ÛŠ›ÜXÚ]JBˆ”ÝXÚÊÜXÚ[™ÎˆMŠHÂˆYˆ]\Ù\ˆH[Ù[\Ù\ˆÂˆ]˜]\•šY]Ê[XYÙNˆ[Ù[˜]˜]\‹˜[YNˆ\Ù\‹™\Ü^S˜[YKÚ^™NˆMŠBˆ›Ý™\›^JÚ\˜ÛJ
KœÝ›ÚÙP›Ü™\Š[YK˜›Ü™\‹[™UÚYˆJJBˆBˆ”ÝXÚÊÜXÚ[™ÎˆJHÂˆ^
[Ù[œ[”™\]Y\ÝËœÜÚOHš[È‘[\ˆ[Ý\ˆSˆÈÛÛ›™XÝˆˆ‘[\ˆ[Ý\ˆSˆÈÛÛ›™XÝ[™Ü[ˆÔÒŠBˆ™›Û
[YK™›Û
NKšX]žJJK›][[[™U^[YÛ›Y[
˜Ù[\ŠBˆ^
–[Ý\ˆÚ^YYÚ]ˆÜ›Ý\SˆŠBˆ™›Û
[YK™›Û
LÊJK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
K›][[[™U^[YÛ›Y[
˜Ù[\ŠBˆBˆ[‘[žJ
Bˆ”ÝXÚÈÂˆYˆ[Ù[œ[\ÞHÈÝXÚÊÜXÚ[™Îˆ
HÈ›ÙÜ™\ÜÕšY]Ê
K˜ÛÛ›ÛÚ^™JœÛX[
NÈ^
ÚXÚÚ[™ø )ˆŠHK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
HBˆ[ÙHYˆ]Y\ÜØYÙHH[Ù[œ[‘\œ›ÜˆÈ^
Y\ÜØYÙJK™›Ü™YÜ›Ý[™Ý[J[YK™[™Ù\ŠK›][[[™U^[YÛ›Y[
˜Ù[\ŠHBˆ[ÙHÈ^
–[Ýx &\™H\ÚÙY]™\žH[YH[ÝHÛÛ›™XÝˆŠK™›Ü™YÜ›Ý[™Ý[J[YK›]]Y
HBˆBˆ™›Û
[YK™›Û
L‹œÙ[ZX›Û
JK™œ˜[YJZ[’ZYÚˆN
Bˆ]ÛŠØ[˜Ù[ŠHÈ[Ù[˜Ø[˜Ù[[Š
HBˆ˜]Û”Ý[J]Û”Ý[Jš[X\žNˆ˜[ÙJJBˆšÙ^X›Ø\™ÚÜÝ]
˜Ø[˜Ù[XÝ[ÛŠBˆ™\ØX›Y
[Ù[œ[\ÞJBˆBˆœY[™ÊšÜš^›Û[Ì
KœY[™Ê™\XØ[ŠBˆ™œ˜[YJÚYˆ
Bˆ˜˜XÚÙÜ›Ý[™
›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆŒ‹Ý[Nˆ˜ÛÛ[[Ý\ÊK™š[
[YKœÝ\™˜XÙJJBˆ›Ý™\›^J[YÛ›Y[ˆÜ
HÈ”Ýš\J
K™œ˜[YJZYÚˆ
K˜Û\Ú\J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆŒ‹Ý[Nˆ˜ÛÛ[[Ý\ÊJHBˆ›Ý™\›^J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆŒ‹Ý[Nˆ˜ÛÛ[[Ý\ÊKœÝ›ÚÙP›Ü™\Š[YK˜›Ü™\ŠJBˆ˜Û\Ú\J›Ý[™Y™XÝ[™ÛJÛÜ›™\”˜Y]\ÎˆŒ‹Ý[Nˆ˜ÛÛ[[Ý\ÊJBˆœÚYÝÊÛÛÜŽˆ˜›XÚË›ÜXÚ]JŒÊK˜Y]\ÎˆÌNˆMŠBˆ˜[œÚ][ÛŠ™YXÙS[Ý[ÛˆÈ›ÜXÚ]Hˆ›ÜXÚ]K˜ÛÛXš[™Y
Ú]ˆœØØ[JØØ[NˆŽM
JK˜ÛÛXš[™Y
Ú]ˆ›Ù™œÙ]
NˆL
JJBˆBˆBŸB‚‹ËËÈHY[IÜÈÛÛ\XÝÝÙ\ˆÝÚ]ÚˆHÛÝÚ[™È›Ý[™]Ûˆ]š[ÈÚ]Hœ˜[™ÛÛÝ\ˆÚ[ˆÛ‹‚œÝXÝÝÙ\”ÝÚ]ÚˆšY]ÈÂˆ]ÛŽˆ›ÛÛˆ]\ÞNˆ›ÛÛˆÝ]Hš]˜]H˜\ˆÝ™\ˆH˜[ÙBˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆ”ÝXÚÈÂˆÚ\˜ÛJ
K™š[
ÛˆÈ[žTÚ\TÝ[J[YK˜œ˜[™
Hˆ[žTÚ\TÝ[JÛÛÜ‹Ú]K›ÜXÚ]JŒ
JJBˆÚ\˜ÛJ
KœÝ›ÚÙP›Ü™\ŠÛˆÈ[žTÚ\TÝ[J[YKœš[™ÊHˆ[žTÚ\TÝ[JÛÛÜ‹Ú]K›ÜXÚ]JŒŒŠJK[™UÚYˆ‹JBˆYˆ\ÞHÈ›ÙÜ™\ÜÕšY]Ê
K˜ÛÛ›ÛÚ^™JœÛX[
K[
Ú]JHBˆ[ÙHÈ[XYÙJÞ\Ý[S˜[YNˆœÝÙ\ˆŠK™›Û
œÞ\Ý[JÚ^™NˆŒÙZYÚˆ˜›Û
JK™›Ü™YÜ›Ý[™Ý[JÛˆÈÛÛÜ‹Ú]HˆÛÛÜ‹Ú]K›ÜXÚ]JŽ
JHBˆBˆ™œ˜[YJÚYˆNZYÚˆN
BˆœÚYÝÊÛÛÜŽˆÛˆÈ[YKš[Û]›ÜXÚ]JŠHˆ˜ÛX\‹˜Y]\ÎˆL
BˆœØØ[QY™™XÝ
Ý™\ˆÈKŒHˆJBˆ˜[š[X][ÛŠ™X\ÙSÝ]
\˜][ÛŽˆŒMJK˜[YNˆÝ™\ŠBˆ›Û’Ý™\ˆÈÝ™\ˆH	BˆBŸB‚‹ËÈPT’ÎˆHØÜ™Y[œÚÝÈ
K\Û˜\ÚÝ›Û\ŠK\ÙYžHÒHÈÚXÚÈH\ÚYÛ‚‚XZ[XÝÜ‚™[[HÛ˜\ÚÝÈÂˆÝ]XÈ[˜ÈØ[\JÝYÙNˆ”“[Ù[”ÝYÙHHœ™XYKÙ]\ˆ›ÛÛHYKÛÛ›™XÝYˆ›ÛÛHYKÙXÝ[ÛŽˆ”“[Ù[”ÙXÝ[ÛˆH˜ÛÛ›™XÝ[ÛŠHOˆ”“[Ù[Âˆ]HH”“[Ù[
™]šY]ÎˆYJBˆKœÝYÙHHÝYÙBˆK\Ù\ˆH\Ù\Š\Ü^S˜[YNˆÚ\›YH]œÙ^H‹[XZ[ˆ˜Ú\›YK›]œÙ^P™Ü›Ý\›Ü™ËZÈ‹YZ[ŽˆYK]˜]\Žˆš[
BˆKš\ÔÙ]\HÙ]\ÈK˜ÛÛ›™XÝYHÛÛ›™XÝYÈKœÙXÝ[ÛˆHÙXÝ[Û‚ˆËÈHÚYHØ[\HXÝ\™KÈÚXÚÈXÝ\™\Èš[HÚ\˜ÛHÚ]Ý]Ý™]Ú[™Ë‚ˆK˜]˜]\ˆH”Ò[XYÙJÚ^™Nˆ”ÔÚ^™JÚYˆZYÚˆMŒ
K›\Yˆ˜[ÙJHÈˆ[‚ˆ”ÑÜ˜YY[
ÛÛÜœÎˆÓ”ÐÛÛÜŠ[YKX[
K”ÐÛÛÜŠ[YKœ\œJWJOË™˜]Ê[Žˆ‹[™ÛNˆJBˆ”ÐÛÛÜ‹Ú]KÚ][PÛÛ\Û™[
ŽJKœÙ]š[

NÈ”Ð™^šY\”]
Ý˜[[Žˆ”Ô™XÝ
ˆKNˆÚYˆÌZYÚˆÌ
JK™š[

Bˆ™]\›ˆYBˆBˆK˜ÛÛ›™XÝYÚ[˜ÙHHÛÛ›™XÝYÈ]J
K˜Y[™Õ[YR[\˜[
MÍM
Hˆš[ˆKœÙ\™\”™XXÚX›HHÛÛ›™XÝYÈYHˆš[ˆKš\HT[™›Ê\ˆÛÛ›™XÝYÈŒŒMËŒMMŒÍŒŒHˆˆŽ‹ŒL‹ŒLN‹šXUœŽˆÛÛ›™XÝY
BˆK™]šXÙS˜[YHHÚ\›Yx &\ÈXXÐ›ÛÚÈ›È‚ˆ]]šXÙ\ÈHÑ]šXÙJYˆ˜H‹˜[YNˆÚ\›Yx &\ÈXXÐ›ÛÚÈ›È‹Y™\ÜÎˆŒLŽŒŒˆ‹ÛÛ›™XÝYˆYK\Ý[™ÚZÙNˆTÓÎŒQ]Q›Ü›X]\Š
KœÝš[™Êœ›ÛNˆ]J
JJKˆ]šXÙJYˆ˜ˆ‹˜[YNˆšTÛ™H‹Y™\ÜÎˆŒLŽŒŒÈ‹ÛÛ›™XÝYˆ˜[ÙK\Ý[™ÚZÙNˆš[
WBˆK™]šXÙ\ÈH]šXÙ\ÂˆKœ›Ùš[HH›Ùš[J\Ù\ŽˆK\Ù\ˆK]šXÙ\Îˆ]šXÙ\Ë[Z]ˆKˆÙ\ÜÚ[ÛœÎˆÔÚYÛ’[‘[žJYˆŒH‹Ú[™ˆ˜\‹Ü™X]Y]ˆŒŒ‹LLLNUNŒLŽŒˆ‹\Ý\ÙY]ˆŒŒ‹LLLNUMŽŒˆ‹\™\œÚ[ÛŽˆŒ‹ŒËŒ‹Ý\œ™[ˆYJKˆÚYÛ’[‘[žJYˆŒˆ‹Ú[™ˆÙXˆ‹Ü™X]Y]ˆŒŒ‹LLLNMŒŽŒˆ‹\Ý\ÙY]ˆŒŒ‹LLLNMŒÌŒˆ‹\™\œÚ[ÛŽˆš[Ý\œ™[ˆ˜[ÙJWKˆXÝ]š]NˆÐXÝ]š]J]ˆŒŒ‹LLLNUNŒLŽŒˆ‹XÝ[ÛŽˆœÚYÛ‹Z[‹˜\‹]Z[ˆš[
KXÝ]š]J]ˆŒŒ‹LLLNMŒŽŒˆ‹XÝ[ÛŽˆ™]šXÙK˜Y‹]Z[ˆš[
KXÝ]š]J]ˆŒŒ‹LLLNLÎNŒˆ‹XÝ[ÛŽˆœÚYÛ‹Z[‹ÙXˆ‹]Z[ˆš[
WJBˆ™]\›ˆBˆB‚ˆÝ]XÈ[˜È\ÚÚ[™Ñ›Ü”[ŠÈNˆ”“[Ù[
HOˆ”“[Ù[ÈKœ[”™\]Y\ÝH”“[Ù[”[”™\]Y\Ý

NÈ™]\›ˆHB‚ˆÝ]XÈ[˜È™[™\ŠÈ›Û\ŽˆT“
HÂˆžOÈš[SX[˜YÙ\‹™Y˜][˜Ü™X]Q\™XÝÜžJ]ˆ›Û\‹Ú][\›YYX]Q\™XÝÜšY\ÎˆYJBˆ]YÙ\ÎˆÊÝš[™Ë”“[Ù[ÑÔÚ^™K›ÛÛ
WHHÂˆ
Ù[ÛÛYH‹Ø[\JÝYÙNˆœÚYÛ’[‹Ù]\ˆ˜[ÙKÛÛ›™XÝYˆ˜[ÙJKÑÔÚ^™JÚYˆNZYÚˆŒ
K˜[ÙJKˆ
˜ÛÛ›™XÝY‹Ø[\J
KÑÔÚ^™JÚYˆLZYÚˆÍŒ
K˜[ÙJKˆ
™\ØÛÛ›™XÝY‹Ø[\JÛÛ›™XÝYˆ˜[ÙJKÑÔÚ^™JÚYˆLZYÚˆÍŒ
K˜[ÙJKˆ
œÙ]\‹Ø[\JÙ]\ˆ˜[ÙKÛÛ›™XÝYˆ˜[ÙJKÑÔÚ^™JÚYˆLZYÚˆÍŒ
K˜[ÙJKˆ
œÜÚ‹Ø[\JÙXÝ[ÛŽˆœÜÚ
KÑÔÚ^™JÚYˆLZYÚˆÍŒ
K˜[ÙJKˆ
œ›Ùš[H‹Ø[\JÙXÝ[ÛŽˆœ›Ùš[JKÑÔÚ^™JÚYˆLZYÚˆŒ
K˜[ÙJKˆ
œÙ][™ÜÈ‹Ø[\JÙXÝ[ÛŽˆœÙ][™ÜÊKÑÔÚ^™JÚYˆLZYÚˆÌ
K˜[ÙJKˆ
œ[ˆ‹\ÚÚ[™Ñ›Ü”[ŠØ[\JÛÛ›™XÝYˆ˜[ÙJJKÑÔÚ^™JÚYˆLZYÚˆÍŒ
K˜[ÙJKˆBˆ›Üˆ\šÈ[ˆÝYK˜[ÙWHÂˆÚÛÝ
]šXÙQØ]UšY]ÊØ]Nˆ]šXÙQØ]J™]šY]ÎˆYKÝ]\Îˆ[›[šÙYÛÙNˆPÑLŒÍHŠJK˜˜XÚÙÜ›Ý[™
[YK˜˜XÚÙÜ›Ý[™
K™›Ü™YÜ›Ý[™Ý[J[YK^
KÚ^™NˆÑÔÚ^™JÚYˆLŒZYÚˆ
K\šÎˆ\šËÎˆ›Û\‹˜\[™[™Ô]ÛÛ\Û™[
™]šXÙK[›ÝX]]Üš\ÙYW
\šÈÈ™\šÈˆˆ›YÚŠKœ™ÈŠJBˆÚÛÝ
]šXÙQØ]UšY]ÊØ]Nˆ]šXÙQØ]J™]šY]ÎˆYKÝ]\Îˆ[›[šÙYÛÙNˆPÑLŒÍHŠKÛÛ\XÝˆYJK˜˜XÚÙÜ›Ý[™
[YK˜˜XÚÙÜ›Ý[™
K™›Ü™YÜ›Ý[™Ý[J[YK^
KÚ^™NˆÑÔÚ^™JÚYˆÌŒZYÚˆŒ
K\šÎˆ\šËÎˆ›Û\‹˜\[™[™Ô]ÛÛ\Û™[
›Y[KY]šXÙKW
\šÈÈ™\šÈˆˆ›YÚŠKœ™ÈŠJBˆ›Üˆ
˜[YK[Ù[Ú^™KÊH[ˆYÙ\ÈÂˆÚÛÝ
XZ[•šY]Ê
K™[š\›Û›Y[Øš™XÝ
[Ù[
KÚ^™NˆÚ^™K\šÎˆ\šËÎˆ›Û\‹˜\[™[™Ô]ÛÛ\Û™[
—
˜[YJKW
\šÈÈ™\šÈˆˆ›YÚŠKœ™ÈŠJBˆBˆ]Y[S[Ù[HØ[\J
BˆÚÛÝ
Y[UšY]Ê
K™[š\›Û›Y[Øš™XÝ
Y[S[Ù[
KÚ^™NˆÑÔÚ^™JÚYˆÌŒZYÚˆŽL
K\šÎˆ\šËÎˆ›Û\‹˜\[™[™Ô]ÛÛ\Û™[
›Y[KW
\šÈÈ™\šÈˆˆ›YÚŠKœ™ÈŠJBˆ][“Y[HH\ÚÚ[™Ñ›Ü”[ŠØ[\JÛÛ›™XÝYˆ˜[ÙJJBˆÚÛÝ
Y[UšY]Ê
K™[š\›Û›Y[Øš™XÝ
[“Y[JKÚ^™NˆÑÔÚ^™JÚYˆÌŒZYÚˆÌ
K\šÎˆ\šËÎˆ›Û\‹˜\[™[™Ô]ÛÛ\Û™[
›Y[K\[‹W
\šÈÈ™\šÈˆˆ›YÚŠKœ™ÈŠJBˆBˆB‚ˆÝ]XÈ[˜ÈÚÛÝŽˆšY]ÏŠÈšY]Îˆ‹Ú^™NˆÑÔÚ^™K\šÎˆ›ÛÛÈ\›ˆT“
HÂˆ]ÜÝH”ÒÜÝ[™ÕšY]Ê›ÛÝšY]ÎˆšY]Ë™œ˜[YJÚYˆÚ^™KÚYZYÚˆÚ^™KšZYÚ
JBˆÜÝ™œ˜[YHHÑÔ™XÝ
ÜšYÚ[Žˆž™\›ËÚ^™NˆÚ^™JBˆ]Ú[™ÝÈH”ÕÚ[™ÝÊÛÛ[™XÝˆÜÝ™œ˜[YKÝ[SX\ÚÎˆË˜›Ü™\›\Ü×K˜XÚÚ[™Îˆ˜Y™™\™YY™\Žˆ˜[ÙJBˆÚ[™ÝË˜\X\˜[˜ÙHH”Ð\X\˜[˜ÙJ˜[YYˆ\šÈÈ™\šÐ\]XHˆ˜\]XJBˆÚ[™ÝË˜ÛÛ[šY]ÈHÜÝˆÚ[™ÝËœÙ]œ˜[YSÜšYÚ[Š”ÔÚ[
ˆLŒNˆLŒ
JBˆÚ[™ÝË›Ü™\‘œ›Û™YØ\™\ÜÊ
BˆÜÝ›^[Ý]ÝX™YRY“™YYY

Bˆ[“ÛÜ˜Ý\œ™[œ[Š[[ˆ]J
K˜Y[™Õ[YR[\˜[
KŒŠJBˆÝX\™]™\HÜÝ˜š]X\[XYÙT™\›ÜØXÚ[™Ñ\Ü^J[ŽˆÜÝ˜›Ý[™ÊH[ÙHÈ™]\›ˆBˆÜÝ˜ØXÚQ\Ü^J[ŽˆÜÝ˜›Ý[™ËÎˆ™\
BˆžOÈ™\œ™\™\Ù[][ÛŠ\Ú[™Îˆœ™Ë›Ü\Y\ÎˆÎ—JOËÜš]JÎˆ\›
BˆÚ[™ÝË›Ü™\“Ý]
š[
BˆBŸB‚‹ËËÈHÛÙ›Ý[™ÛÝÈ
H˜YX[Ü˜YY[ÛÈ]ÛÚÜÈHØ[YH]™\ž]Ú\™KØÜ™Y[œÚÝÈ[˜ÛYY
K‚œÝXÝÛÝÎˆšY]ÈÂˆ]ÛÛÜŽˆÛÛÜ‚ˆ]Ú^™NˆÑÑ›Ø]ˆ˜\ˆ›ÙNˆÛÛYHšY]ÈÂˆ˜YX[Ü˜YY[
ÛÛÜœÎˆØÛÛÜ‹ÛÛÜ‹›ÜXÚ]J
WKÙ[\Žˆ˜Ù[\‹Ý\˜Y]\Îˆ[™˜Y]\ÎˆÚ^™HÈŠBˆ™œ˜[YJÚYˆÚ^™KZYÚˆÚ^™JBˆ˜[ÝÜÒ]\Ý[™Ê˜[ÙJBˆBŸB