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
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.surface2)))
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
                Text(model.connected ? "All of this Macâ€™s internet traffic is encrypted and going through HN Groupâ€™s UK server." : "Turn on the VPN to encrypt all of this Macâ€™s traffic through HN Groupâ€™s UK server.")
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
                        Button { model.show(.ssh) } label: { HStack(spacing: 7) { Image(systemName: "terminal"); Text("Open SSH") } }
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
                Glow(color: Theme.pink.opacity(model.connected ? 0.22 : 0.06), size: 260).offset(x: 260, y: -90)
                Glow(color: Theme.teal.opacity(model.connected ? 0.22 : 0.05), size: 220).offset(x: -220, y: 110)
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
            .lineLimit(1).fixedSize()
            .padding(.horizontal, 20).padding(.vertical, 11)
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

/// SSH to the server through the VPN, as a small terminal: the username sits in the prompt and only the
/// password is asked for. Return opens the session in Terminal.
struct SSHPage: View {
    @EnvironmentObject var model: VPNModel
    @State private var password = ""
    @FocusState private var focus: Field?
    enum Field { case user, password }

    private var ready: Bool { !model.sshBusy && !model.busy && !password.isEmpty && model.isSetUp }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            PageTitle(eyebrow: "SSH", title: "HN Group server", text: "Open a secure shell on the server, straight through the VPN.")

            VStack(alignment: .leading, spacing: 0) {
                // Title bar
                HStack(spacing: 8) {
                    HStack(spacing: 7) {
                        Circle().fill(Color(hex: 0xFF5F57)); Circle().fill(Color(hex: 0xFEBC2E)); Circle().fill(Color(hex: 0x28C840))
                    }
                    .frame(width: 54, height: 12)
                    Spacer()
                    Image(systemName: "lock.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(.white.opacity(0.4))
                    Text("\(user)@\(VPNModel.serverAddress) â€” ssh").font(.system(size: 12, weight: .medium, design: .monospaced)).foregroundStyle(.white.opacity(0.55))
                    Spacer()
                    StatusPill(on: model.connected && model.serverReachable == true,
                               text: !model.connected ? "VPN off" : model.serverReachable == true ? "Online" : model.serverReachable == false ? "Not answering" : "Checking")
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Color.white.opacity(0.04))
                .overlay(alignment: .bottom) { Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1) }

                // Console
                VStack(alignment: .leading, spacing: 14) {
                    Group {
                        Text("HN Secure Access Terminal Â· encrypted session through the HN Group VPN").foregroundColor(.white.opacity(0.35))
                        HStack(spacing: 0) {
                            Text("âœ ").foregroundColor(Theme.green)
                            Text("ssh ").foregroundColor(.white.opacity(0.9))
                            TextField("root", text: $model.sshUser)
                                .textFieldStyle(.plain).foregroundColor(Color(hex: 0xC9B4FF))
                                .disableAutocorrection(true)
                                .focused($focus, equals: .user)
                                .onSubmit { focus = .password }
                                .fixedSize()
                            Text("@\(VPNModel.serverAddress)").foregroundColor(Color(hex: 0xC9B4FF))
                            Spacer(minLength: 0)
                        }
                        HStack(spacing: 10) {
                            Text("password:").foregroundColor(.white.opacity(0.55))
                            SecureField("", text: $password)
                                .textFieldStyle(.plain).foregroundColor(.white)
                                .focused($focus, equals: .password)
                                .onSvßÎm¢G§²ÚîÆ­yÒ†6÷&æW%&F—W3¢F†VÖRç&F—W2Â7G–ÆS¢æ6öçF–çV÷W2’¢æ÷fW&Æ’…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢F†VÖRç&F—W2Â7G–ÆS¢æ6öçF–çV÷W2’ç7G&ö¶T&÷&FW"…F†VÖRæ&÷&FW"æ÷6—G’ƒã‚’’¢ç6†F÷r†6öÆ÷#¢æ&Æ6²æ÷6—G’ƒãR’Â&F—W3¢Â“¢B¢FW‡B‚%–÷W"æÖRæB†÷Fò6öÖRg&öÒ–÷W"„âw&÷W7Ffb&öf–ÆRâ6†ævRF†VÒ–âF†R7Ffb÷'FÂ÷"„â'&÷w6W"â"¢æföçB…F†VÖRæföçBƒ"’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB ¢–bÆWBÒÖöFVÂç&öf–ÆR°¢6&B°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢’°¢6V7F–öä†VF–ær‡F—FÆS¢%v†W&R–÷^(	—&R6–væVB–â"Â–6öã¢&¶W’æf–ÆÂ"¢f÷$V6‚‡ç6W76–öç2’²2–à¢Æ—7E&÷r†–6öã¢2æ¶–æBÓÒ&"ò&ÆF÷6ö×WFW""¢&vÆö&R"À¢F—FÆS¢‡2æ¶–æBÓÒ&"ò%6V7W&R66W72FW&Ö–æÂ"²‡2æfW'6–öâæÖ²""²CÒóò""’¢%vV'6—FR"’²‡2æ7W'&VçBò"+rF†—2Ö2"¢""’À¢7V'F—FÆS¢%6–væVB–âÂ…v†Vâç6†÷'B‡2æ7&VFVDB’’+rÆ7BW6VBÂ…v†Vâç6†÷'B‡2æÆ7EW6VDB’’"’°¢–b2æ7W'&VçB²&FvR‡FW‡C¢$7W'&VçB"Â6öÆ÷W#¢F†VÖRç7V66W72’Ğ¢VÇ6R²'WGFöâ‚%6–vâ÷WB"’²F6²²v—BÖöFVÂæVæE6–vä–â‡2’ÒÒæ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡&–Ö'“¢fÇ6R’’Ğ¢Ğ¢Ğ¢Ğ¢Ğ¢6&B°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢’°¢…7F6²°¢6V7F–öä†VF–ær‡F—FÆS¢%–÷W"FWf–6W2"Â–6öã¢&ÆF÷6ö×WFW"ææBæ—†öæR"¢76W"‚¢'WGFöâ‚$ÖævRöâF†RvV""’²å5v÷&·76Rç6†&VBæ÷Vâ„’æ&6R’Òæ'WGFöå7G–ÆR‚çÆ–â’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB’æföçB…F†VÖRæföçBƒ"Âæ&öÆB’¢Ğ¢–bæFWf–6W2æ—4V×G’²FW‡B‚$æòFWf–6W2–WBâ"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB’Ğ¢f÷$V6‚‡æFWf–6W2’²B–à¢Æ—7E&÷r†–6öã¢BææÖRç&ævR†öc¢&Ö7Æ&öö·ÆÆF÷"Â÷F–öç3¢²ç&VwVÆ$W‡&W76–öâÂæ66T–ç6Vç6—F—fUÒ’Òæ–Âò&ÆF÷6ö×WFW""¢&—†öæR"À¢F—FÆS¢BææÖRÂ7V'F—FÆS¢BæFG&W72’°¢&FvR‡FW‡C¢v†Vâævò†BæÆ7D†æG6†¶R’Â6öÆ÷W#¢Bæ6öææV7FVBÓÒG'VRòF†VÖRç7V66W72¢F†VÖRæ×WFVB¢Ğ¢Ğ¢Ğ¢Ğ¢6&B°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢’°¢6V7F–öä†VF–ær‡F—FÆS¢%&V6VçB7F—f—G’"Â–6öã¢&6Æö6²æ'&÷ræ6—&6ÆWF‚"’çFF–ær‚æ&÷GFöÒÂ‚¢–bæ7F—f—G’æ—4V×G’²FW‡B‚$æ÷F†–ær–WBâ"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB’Ğ¢f÷$V6‚„'&’‡æ7F—f—G’æVçVÖW&FVB‚’’Â–C¢Âæöfg6WB’²’Â–à¢…7F6²†Æ–væÖVçC¢çF÷Â76–æs¢B’°¢e7F6²‡76–æs¢’°¢6—&6ÆR‚’æf–ÆÂ…F†VÖRæ'&æB’æg&ÖR‡v–GFƒ¢Â†V–v‡C¢’æ÷fW&Æ’„6—&6ÆR‚’ç7G&ö¶R…F†VÖRæ66VçE6ögBÂÆ–æUv–GFƒ¢2’¢–b’Âæ7F—f—G’æ6÷VçBÒ²&V7FævÆR‚’æf–ÆÂ…F†VÖRæ&÷&FW"’æg&ÖR‡v–GFƒ¢"’æg&ÖR†Ö„†V–v‡C¢æ–æf–æ—G’’Ğ¢Ğ¢æg&ÖR‡v–GFƒ¢"¢FW‡B†Æ&VÇ5¶æ7F–öåÒóòæ7F–öâ’æföçB…F†VÖRæföçBƒ2ÂæÖVF—VÒ’’çFF–ær‚æ&÷GFöÒÂB¢76W"‚¢FW‡B…v†Vâç6†÷'B†æB’’æföçB…F†VÖRæföçBƒ"’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB¢Ğ¢Ğ¢Ğ¢Ğ¢ÒVÇ6R°¢…7F6²²76W"‚“²&öw&W75f–Wr‚“²76W"‚’ÒçFF–ærƒC¢Ğ¢Ğ¢Ğ§Ğ ¢òòò&VF&ÆRÆ&VÆÆVB–ÆÃ¢â–6öâæB6VçFVæ6RÖ66RFW‡Böâ6ögBF–çBÂæWfW"w&–ærà§7G'V7B–ÆÃ¢f–Wr°¢ÆWB–6öã¢7G&–æp¢ÆWBFW‡C¢7G&–æp¢f"6öÆ÷W#¢6öÆ÷"ÒF†VÖRæ66Vç@¢f"&öG“¢6öÖRf–Wr°¢…7F6²‡76–æs¢b’°¢–ÖvR‡7—7FVÔæÖS¢–6öâ’æföçB‚ç7—7FVÒ‡6—¦S¢ÂvV–v‡C¢æ&öÆB’¢FW‡B‡FW‡B’æföçB…F†VÖRæföçBƒ"ãRÂæ&öÆB’¢Ğ¢æf÷&Vw&÷VæE7G–ÆR†6öÆ÷W"¢æÆ–æTÆ–Ö—Bƒ’æf—†VE6—¦R‚¢çFF–ær‚æ†÷&—¦öçFÂÂ’çFF–ær‚çfW'F–6ÂÂb¢æ&6¶w&÷VæB„67VÆR‚’æf–ÆÂ†6öÆ÷W"æ÷6—G’ƒãB’’¢æ÷fW&Æ’„67VÆR‚’ç7G&ö¶T&÷&FW"†6öÆ÷W"æ÷6—G’ƒã2’’¢Ğ§Ğ §7G'V7B6V7F–öä†VF–æs¢f–Wr°¢ÆWBF—FÆS¢7G&–æp¢ÆWB–6öã¢7G&–æp¢f"&öG“¢6öÖRf–Wr°¢…7F6²‡76–æs¢‚’°¢–ÖvR‡7—7FVÔæÖS¢–6öâ’æföçB‚ç7—7FVÒ‡6—¦S¢"ÂvV–v‡C¢æ&öÆB’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB¢FW‡B‡F—FÆR’æföçB…F†VÖRæföçBƒbÂæ&öÆB’¢Ğ¢çFF–ær‚æ&÷GFöÒÂ"¢Ğ§Ğ §7G'V7BÆ—7E&÷sÅG&–Æ–æs¢f–Wsã¢f–Wr°¢ÆWB–6öã¢7G&–æp¢ÆWBF—FÆS¢7G&–æp¢ÆWB7V'F—FÆS¢7G&–æp¢f–Wt'V–ÆFW"f"G&–Æ–æs¢G&–Æ–æp¢7FFR&—fFRf"†÷fW"ÒfÇ6P¢f"&öG“¢6öÖRf–Wr°¢…7F6²‡76–æs¢"’°¢–ÖvR‡7—7FVÔæÖS¢–6öâ’æföçB‚ç7—7FVÒ‡6—¦S¢RÂvV–v‡C¢æÖVF—VÒ’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB¢æg&ÖR‡v–GFƒ¢3‚Â†V–v‡C¢3‚’æ&6¶w&÷VæB…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢Â7G–ÆS¢æ6öçF–çV÷W2’æf–ÆÂ…F†VÖRæ66VçE6ögB’¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢"’°¢FW‡B‡F—FÆR’æföçB…F†VÖRæföçBƒBÂæ&öÆB’’æÆ–æTÆ–Ö—Bƒ¢FW‡B‡7V'F—FÆR’æföçB…F†VÖRæföçBƒ"’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB’æÆ–æTÆ–Ö—Bƒ¢Ğ¢76W"†Ö–äÆVæwFƒ¢‚¢G&–Æ–æp¢Ğ¢çFF–ærƒ"¢æ&6¶w&÷VæB…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢BÂ7G–ÆS¢æ6öçF–çV÷W2’æf–ÆÂ††÷fW"òF†VÖRç7W&f6S"¢F†VÖRç7W&f6S"æ÷6—G’ƒãb’’¢æ÷fW&Æ’…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢BÂ7G–ÆS¢æ6öçF–çV÷W2’ç7G&ö¶T&÷&FW"…F†VÖRæ&÷&FW"æ÷6—G’ƒãr’’¢ææ–ÖF–öâ‚æV6T÷WB†GW&F–öã¢ãR’ÂfÇVS¢†÷fW"¢æöä†÷fW"²†÷fW"ÒCĞ¢Ğ§Ğ ¢òòÔ$³¢Ò6WGF–æw0 §7G'V7B6WGF–æw5vS¢f–Wr°¢Vçf—&öæÖVçDö&¦V7Bf"ÖöFVÃ¢eäÖöFVÀ¢f"&öG“¢6öÖRf–Wr°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢‚’°¢vUF—FÆR†W–V'&÷s¢%6WGF–æw2"ÂF—FÆS¢%6WGF–æw2"¢6&B°¢…7F6²‡76–æs¢b’°¢Ö&²‡6—¦S¢S‚¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢2’°¢FW‡B‚$„â6V7W&R66W72FW&Ö–æÂ"’æföçB…F†VÖRæföçBƒrÂæ&öÆB’¢FW‡B„–æfòæÆ&VÂ’æföçB…F†VÖRæföçBƒ2’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB¢WFFU7FGW2æföçB…F†VÖRæföçBƒ"Âç6VÖ–&öÆB’’çFF–ær‚çF÷Â"¢Ğ¢76W"‚¢WFFT6öçG&öÀ¢Ğ¢Ğ¢6&B°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢B’°¢6V7F–öä†VF–ær‡F—FÆS¢$vVæW&Â"Â–6öã¢'6Æ–FW"æ†÷&—¦öçFÂã2"¢FövvÆR†—4öã¢&–æF–ær†vWC¢²ÖöFVÂæÆVæ6„DÆöv–âÒÂ6WC¢²ÖöFVÂç6WDÆVæ6„DÆöv–â‚C’Ò’’°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢"’°¢FW‡B‚$÷Vâ6V7W&R66W72FW&Ö–æÂv†Vâ’Æör–â"’æföçB…F†VÖRæföçBƒBÂç6VÖ–&öÆB’¢FW‡B‚%F†R6†–VÆB7F—2–âF†RÖVçR&"f÷"V–6²66W72â"’æföçB…F†VÖRæföçBƒ"’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB¢Ğ¢Ğ¢çFövvÆU7G–ÆR‚ç7v—F6‚’çF–çB…F†VÖRçW'ÆR¢Ğ¢Ğ¢6&B°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢B’°¢6V7F–öä†VF–ær‡F—FÆS¢$66÷VçB"Â–6öã¢'W'6öâæ7&÷æ6—&6ÆR"¢…7F6²‡76–æs¢’°¢'WGFöâ‚$ÖævRFWf–6W2öâF†RvV""’²å5v÷&·76Rç6†&VBæ÷Vâ„’æ&6R’Òæ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡&–Ö'“¢fÇ6R’¢'WGFöâ‚%&Vg&W6‚"’²F6²²v—BÖöFVÂç&Vg&W6‚‚’ÒÒæ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡&–Ö'“¢fÇ6R’¢76W"‚¢'WGFöâ‚%6–vâ÷WB"’²F6²²v—BÖöFVÂç6–vä÷WB‚’ÒÒæ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡&–Ö'“¢fÇ6R’¢æ†VÇ‚$F—66öææV7G2æB&VÖ÷fW2F†—2Ö2g&öÒF†Reââ"¢Ğ¢FW‡B‚%6–væ–ær÷WBF—66öææV7G2æB&VÖ÷fW2F†—2Ö2g&öÒF†Reââ"’æföçB…F†VÖRæföçBƒ"’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB¢Ğ¢Ğ¢Ğ¢Ğ ¢f–Wt'V–ÆFW"&—fFRf"WFFT6öçG&öÃ¢6öÖRf–Wr°¢–bÖöFVÂçWFFRÒæ–Â°¢'WGFöâ‚%WFFRæ÷r"’²F6²²v—BÖöFVÂæ–ç7FÆÅWFFR‚’ÒÒæ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‚’¢æF—6&ÆVB†ÖöFVÂçWFFU7FFRÓÒæF÷væÆöF–ærÇÂÖöFVÂçWFFU7FFRÓÒæ–ç7FÆÆ–ær¢ÒVÇ6R°¢'WGFöâ‚$6†V6²f÷"WFFW2"’²F6²²v—BÖöFVÂæ6†V6´f÷%WFFR‚’ÒÒæ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡&–Ö'“¢fÇ6R’¢æF—6&ÆVB†ÖöFVÂçWFFU7FFRÓÒæ6†V6¶–ær¢Ğ¢Ğ ¢f–Wt'V–ÆFW"&—fFRf"WFFU7FGW3¢6öÖRf–Wr°¢7v—F6‚ÖöFVÂçWFFU7FFR°¢66Ræ6†V6¶–æs¢Æ&VÂ‚$6†V6¶–æ~(
b"Â7—7FVÔ–ÖvS¢&'&÷rçG&–ævÆRã"æ6—&6ÆWF‚"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB¢66RçWFôFFS¢Æ&VÂ‚%–÷R†fRF†RÆFW7BfW'6–öââ"Â7—7FVÔ–ÖvS¢&6†V6¶Ö&²æ6—&6ÆRæf–ÆÂ"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRç7V66W72¢66RæF÷væÆöF–æs¢Æ&VÂ‚$F÷væÆöF–ærF†RWFF^(
b"Â7—7FVÔ–ÖvS¢&'&÷ræF÷vâæ6—&6ÆR"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB¢66Ræ–ç7FÆÆ–æs¢Æ&VÂ‚$–ç7FÆÆ–æ~(
bF†Rv–ÆÂ&V÷Vâ'’—G6VÆbâ"Â7—7FVÔ–ÖvS¢&vV'6†Rã""’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB¢66Ræf–ÆVB†ÆWBÖW76vR“¢Æ&VÂ†ÖW76vRÂ7—7FVÔ–ÖvS¢&W†6ÆÖF–öæÖ&²çG&–ævÆRæf–ÆÂ"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæFævW"¢66Ræ–FÆS ¢–bÆWB&VÆV6RÒÖöFVÂçWFFR²Æ&VÂ‚%fW'6–öâÂ‡&VÆV6RçfW'6–öâ’—2f–Æ&ÆRâ"Â7—7FVÔ–ÖvS¢'7&¶ÆW2"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB’Ğ¢Ğ¢Ğ§Ğ ¢òòÔ$³¢ÒÖVçR&  §7G'V7BÖVçUf–Ws¢f–Wr°¢Vçf—&öæÖVçDö&¦V7Bf"ÖöFVÃ¢eäÖöFVÀ¢Vçf—&öæÖVçB…Âæ÷Våv–æF÷r’&—fFRf"÷Våv–æF÷p¢Vçf—&öæÖVçB…Âæ66W76–&–Æ—G•&VGV6TÖ÷F–öâ’&—fFRf"&VGV6TÖ÷F–öà¢ö'6W'fVDö&¦V7Bf"vFRÒFWf–6TvFRç6†&V@¢7FF–2ÆWBv–GFƒ¢4tfÆöBÒ3#  ¢f"&öG“¢6öÖRf–Wr°¢òòæ÷B&÷fVBöâFWf–6W2æ†æw&÷Wæ÷&rçV³¢F†RÖVçRöæÇ’W‡Æ–ç2v‡’Âv—F‚F†R6öFRFòFBF†—2Ö2à¢–bvFRæÆÆ÷vVB°¢e7F6²‡76–æs¢’°¢„å7G&—R‚’æg&ÖR††V–v‡C¢2¢FWf–6TvFUf–Wr†vFS¢vFRÂ6ö×7C¢G'VR¢Ğ¢æg&ÖR‡v–GFƒ¢6VÆbçv–GF‚¢æf—†VE6—¦R††÷&—¦öçFÃ¢fÇ6RÂfW'F–6Ã¢G'VR¢æ&6¶w&÷VæB…F†VÖRæ&6¶w&÷VæB¢æf÷&Vw&÷VæE7G–ÆR…F†VÖRçFW‡B¢ÒVÇ6R°¢ÖVçP¢Ğ¢Ğ ¢&—fFRf"ÖVçS¢6öÖRf–Wr°¢e7F6²‡76–æs¢’°¢†VFW ¢„å7G&—R‚’æg&ÖR††V–v‡C¢2¢e7F6²‡76–æs¢‚’°¢–bÆWB&VÆV6RÒÖöFVÂçWFFR°¢'WGFöâ²÷Vâ‚ç6WGF–æw2’ÒÆ&VÃ¢°¢Æ&VÂ‚%fW'6–öâÂ‡&VÆV6RçfW'6–öâ’—2&VG’Fò–ç7FÆÂ"Â7—7FVÔ–ÖvS¢&'&÷ræF÷vâæ6—&6ÆRæf–ÆÂ"¢æg&ÖR†Ö…v–GFƒ¢æ–æf–æ—G’ÂÆ–væÖVçC¢æÆVF–ær¢Ğ¢æ'WGFöå7G–ÆR‚çÆ–â’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB’æföçB…F†VÖRæföçBƒ"Âæ&öÆB’¢çFF–ær‚æ&÷GFöÒÂ"¢Ğ¢–bÖöFVÂç7FvRÓÒç&VG’bbÖöFVÂæ—56WEW°¢'WGFöâ²÷Vâ‚ç76‚’ÒÆ&VÃ¢²…7F6²‡76–æs¢‚’²–ÖvR‡7—7FVÔæÖS¢'FW&Ö–æÂ"“²FW‡B‚%54‚FòF†R6W'fW""’ÒĞ¢æ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡&–Ö'“¢fÇ6RÂv–FS¢G'VR’¢Ğ¢'WGFöâ²÷Vâ†æ–Â’ÒÆ&VÃ¢²FW‡B‚$÷Vâ6V7W&R66W72FW&Ö–æÂ"’Òæ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡v–FS¢G'VR’¢Ğ¢çFF–ærƒB¢&V7FævÆR‚’æf–ÆÂ…F†VÖRæ&÷&FW"æ÷6—G’ƒã‚’’æg&ÖR††V–v‡C¢¢…7F6²°¢'WGFöâ‚%eâvV'6—FR"’²å5v÷&·76Rç6†&VBæ÷Vâ„’æ&6R’Òæ'WGFöå7G–ÆR‚çÆ–â’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ66VçB¢76W"‚¢'WGFöâ‚%V—B"’²å4Æ–6F–öâç6†&VBçFW&Ö–æFR†æ–Â’Òæ'WGFöå7G–ÆR‚çÆ–â’æ¶W–&ö&E6†÷'F7WB‚'"¢Ğ¢æföçB…F†VÖRæföçBƒ"Âç6VÖ–&öÆB’¢çFF–ær‚æ†÷&—¦öçFÂÂb’çFF–ær‚çfW'F–6ÂÂ¢Ğ¢òòf—†VBv–GF‚æBF†R6öçFVçBw2÷vâ†V–v‡BÂ6òF†RÖVçR&"v–æF÷r—2Çv—2Æ–B÷WBF†R6ÖRv’à¢æg&ÖR‡v–GFƒ¢6VÆbçv–GF‚¢æf—†VE6—¦R††÷&—¦öçFÃ¢fÇ6RÂfW'F–6Ã¢G'VR¢æ&6¶w&÷VæB…F†VÖRæ&6¶w&÷VæB¢æf÷&Vw&÷VæE7G–ÆR…F†VÖRçFW‡B¢Ğ ¢òòòF†R7FGW3¢F†R„âw&÷WÆövòÂv†òw26–væVB–âÂæB÷vW"7v—F6‚v—F‚F†R6öææV7F–öâFWF–Ç2à¢&—fFRf"†VFW#¢6öÖRf–Wr°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢B’°¢…7F6²‡76–æs¢‚’°¢„åv÷&FÖ&²††V–v‡C¢#"¢76W"†Ö–äÆVæwFƒ¢‚¢–bÖöFVÂç7FvRÓÒç&VG’ÂÆWBW6W"ÒÖöFVÂçW6W"°¢fF%f–Wr†–ÖvS¢ÖöFVÂæfF"ÂæÖS¢W6W"æF—7Æ”æÖRÂ6—¦S¢#b¢æ÷fW&Æ’„6—&6ÆR‚’ç7G&ö¶T&÷&FW"„6öÆ÷"çv†—FRæ÷6—G’ƒã#R’ÂÆ–æUv–GFƒ¢’¢Ğ¢Ğ¢–bÖöFVÂç7FvRÓÒç&VG’bbÖöFVÂæ—56WEWbbÖöFVÂç–å&WVW7BÒæ–Â°¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢’°¢FW‡B‚$VçFW"–÷W"”âFò6öææV7B"’æföçB…F†VÖRæföçBƒbÂæ†Vg’’’æf÷&Vw&÷VæE7G–ÆR‚çv†—FR¢–äVçG'’†6ö×7C¢G'VR¢…7F6²°¢FW‡B†ÖöFVÂç–äW'&÷"óò%–÷W"6—‚ÖF–v—B„âw&÷W”â"¢æföçB…F†VÖRæföçBƒÂç6VÖ–&öÆB’’æf÷&Vw&÷VæE7G–ÆR†ÖöFVÂç–äW'&÷"ÓÒæ–Âò6öÆ÷"çv†—FRæ÷6—G’ƒãr’¢6öÆ÷"††Wƒ¢„dd#D3‚’¢æf—†VE6—¦R††÷&—¦öçFÃ¢fÇ6RÂfW'F–6Ã¢G'VR¢76W"†Ö–äÆVæwFƒ¢‚¢'WGFöâ‚$6æ6VÂ"’²ÖöFVÂæ6æ6VÅ–â‚’Òæ'WGFöå7G–ÆR‚çÆ–â’æföçB…F†VÖRæföçBƒ"Âæ&öÆB’’æf÷&Vw&÷VæE7G–ÆR‚çv†—FRæ÷6—G’ƒãƒR’¢Ğ¢Ğ¢çG&ç6—F–öâ‚æ÷6—G’¢ÒVÇ6R–bÖöFVÂç7FvRÓÒç&VG’bbÖöFVÂæ—56WEW°¢…7F6²‡76–æs¢B’°¢'WGFöâ²F6²²v—BÖöFVÂçFövvÆR‚’ÒÒÆ&VÃ¢²÷vW%7v—F6‚†öã¢ÖöFVÂæ6öææV7FVBÂ'W7“¢ÖöFVÂæ'W7’’Ğ¢æ'WGFöå7G–ÆR‚çÆ–â’æF—6&ÆVB†ÖöFVÂæ'W7’¢æ66W76–&–Æ—G”Æ&VÂ†ÖöFVÂæ6öææV7FVBò$F—66öææV7B"¢$6öææV7B"¢e7F6²†Æ–væÖVçC¢æÆVF–ærÂ76–æs¢2’°¢FW‡B†ÖöFVÂæ'W7’ò%v÷&¶–æ~(
b"¢ÖöFVÂæ6öææV7FVBò%&÷FV7FVB"¢$æ÷B&÷FV7FVB"¢æföçB…F†VÖRæföçBƒ‚Âæ†Vg’’’æf÷&Vw&÷VæE7G–ÆR‚çv†—FR¢FW‡B†ÖöFVÂæ6öææV7FVBò†ÖöFVÂæ—òæ—óò%F‡&÷Vv‚„âw&÷W"’¢$6Æ–6²Fò6öææV7B"¢æföçB…F†VÖRæföçBƒ"’’æf÷&Vw&÷VæE7G–ÆR‚çv†—FRæ÷6—G’ƒãr’’æÆ–æTÆ–Ö—Bƒ¢–bÖöFVÂæ6öææV7FVB°¢Æ&VÂ‚%Væ—FVB¶–ævFöÒ"Â7—7FVÔ–ÖvS¢&Ö–âæ6—&6ÆRæf–ÆÂ"¢æföçB…F†VÖRæföçBƒÂç6VÖ–&öÆB’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæw&VVâ¢Ğ¢Ğ¢76W"†Ö–äÆVæwFƒ¢¢Ğ¢ÒVÇ6R°¢FW‡B†ÖöFVÂç7FvRÓÒç&VG’ò$f–æ—6‚6WGF–ærWF†—2Ö2–âF†Râ"¢%6–vâ–âFòW6RF†Reââ"¢æföçB…F†VÖRæföçBƒ2’’æf÷&Vw&÷VæE7G–ÆR‚çv†—FRæ÷6—G’ƒã‚’¢æf—†VE6—¦R††÷&—¦öçFÃ¢fÇ6RÂfW'F–6Ã¢G'VR¢Ğ¢Ğ¢çFF–ærƒb¢æg&ÖR‡v–GFƒ¢6VÆbçv–GF‚ÂÆ–væÖVçC¢æÆVF–ær¢æ&6¶w&÷VæB€¢¥7F6²°¢ÖöFVÂæ6öææV7FVBòF†VÖRæ†W&ôöâ¢F†VÖRæ†W&ôöf`¢vÆ÷r†6öÆ÷#¢F†VÖRç–æ²æ÷6—G’†ÖöFVÂæ6öææV7FVBòã#R¢ã‚’Â6—¦S¢ƒ’æöfg6WB‡ƒ¢#Â“¢ÓC¢Ğ¢¢æ6Æ—VB‚¢æVçf—&öæÖVçB…Âæ6öÆ÷%66†VÖRÂæF&²¢ææ–ÖF–öâ‡&VGV6TÖ÷F–öâòæ–Â¢æV6T–ä÷WB†GW&F–öã¢ã2’ÂfÇVS¢ÖöFVÂæ6öææV7FVB¢ææ–ÖF–öâ‡&VGV6TÖ÷F–öâòæ–Â¢æV6T÷WB†GW&F–öã¢ã"’ÂfÇVS¢ÖöFVÂç–å&WVW7B¢Ğ ¢&—fFRgVæ2÷Vâ…ò6V7F–öã¢eäÖöFVÂå6V7F–öãò’°¢–bÆWB6V7F–öâÒ6V7F–öâ²ÖöFVÂç6†÷r‡6V7F–öâ’Ğ¢÷Våv–æF÷r†–C¢&Ö–â"¢å4æ7F—fFR†–væ÷&–æt÷F†W$3¢G'VR¢Ğ§Ğ ¢òòÔ$³¢Ò”â&Vf÷&R6öææV7F–æp ¢òòò6—‚Ö6¶VB&÷†W2f÷"F†R„âw&÷W”ââG—–ærF†R6—‡F‚F–v—B6†V6·2—Böæ6S²w&öær”â6†¶W0¢òòòF†R&÷†W2æB6ÆV'2F†VÒâöæR†–FFVâf–VÆBF¶W2F†RG—–ær†æB7F–ær’6òF†R&÷†W27F’6–×ÆRà§7G'V7B–äVçG'“¢f–Wr°¢Vçf—&öæÖVçDö&¦V7Bf"ÖöFVÃ¢eäÖöFVÀ¢f"6ö×7BÒfÇ6P¢7FFR&—fFRf"6öFRÒ" ¢7FFR&—fFRf"6†¶W3¢4tfÆöBÒ ¢fö7W57FFR&—fFRf"fö7W6VC¢&ööÀ¢Vçf—&öæÖVçB…Âæ66W76–&–Æ—G•&VGV6TÖ÷F–öâ’&—fFRf"&VGV6TÖ÷F–öà ¢f"&öG“¢6öÖRf–Wr°¢¥7F6²°¢6V7W&Tf–VÆB‚""ÂFW‡C¢F6öFR¢çFW‡Df–VÆE7G–ÆR‚çÆ–â¢æfö7W6VB‚Ffö7W6VB¢æg&ÖR‡v–GFƒ¢Â†V–v‡C¢’æ÷6—G’ƒã¢æ66W76–&–Æ—G”Æ&VÂ‚%6—‚ÖF–v—B”â"¢æöä6†ævR†öc¢6öFR’²G—VB–à¢ÆWBF–v—G2Ò7G&–ær‡G—VBæf–ÇFW"²Cæ—444”’bbCæ—4çVÖ&W"Òç&Vf—‚ƒb’¢–bF–v—G2ÒG—VB²6öFRÒF–v—G3²&WGW&âĞ¢–bF–v—G2æ6÷VçBÓÒbbbÖöFVÂç–ä'W7’²F6²²v—BÖöFVÂç7V&Ö—E–â†F–v—G2’ÒĞ¢Ğ¢…7F6²‡76–æs¢6ö×7Bòr¢’°¢f÷$V6‚ƒâãÃbÂ–C¢Âç6VÆb’²’–â&÷‚†’’Ğ¢Ğ¢æ6öçFVçE6†R…&V7FævÆR‚’¢æöåFvW7GW&R²fö7W6VBÒG'VRĞ¢Ğ¢æÖöF–f–W"…6†¶R†Ö÷VçC¢6†¶W2’¢æ÷6—G’†ÖöFVÂç–ä'W7’òãb¢¢æöäV"²6öFRÒ"#²fö7W6VBÒG'VS²F—7F6…VWVRæÖ–âæ7–æ2²fö7W6VBÒG'VRÒĞ¢æöä6†ævR†öc¢ÖöFVÂç–äW'&÷"’²ÖW76vR–à¢wV&BÖW76vRÒæ–ÂVÇ6R²&WGW&âĞ¢6öFRÒ"#²fö7W6VBÒG'VP¢–b&VGV6TÖ÷F–öâ²v—F„æ–ÖF–öâ‚æÆ–æV"†GW&F–öã¢ãB’’²6†¶W2³ÒÒĞ¢Ğ¢Ğ ¢&—fFRgVæ2&÷‚…ò“¢–çB’Óâ6öÖRf–Wr°¢ÆWBf–ÆÆVBÒ’Â6öFRæ6÷VçBÂ7W'&VçBÒfö7W6VBbb’ÓÒÖ–â†6öFRæ6÷VçBÂR’bbÖöFVÂç–ä'W7¢ÆWB6—¦S¢4tfÆöBÒ6ö×7Bò3‚¢C€¢&WGW&â&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢6ö×7Bò¢"Â7G–ÆS¢æ6öçF–çV÷W2¢æf–ÆÂ†6ö×7Bò6öÆ÷"çv†—FRæ÷6—G’†f–ÆÆVBòã‚¢ã‚’¢†f–ÆÆVBòF†VÖRæ66VçE6ögB¢F†VÖRç7W&f6S"’¢æ÷fW&Æ’…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢6ö×7Bò¢"Â7G–ÆS¢æ6öçF–çV÷W2¢ç7G&ö¶T&÷&FW"†7W'&VçBòF†VÖRçf–öÆWB¢†6ö×7Bò6öÆ÷"çv†—FRæ÷6—G’ƒã#"’¢F†VÖRæ&÷&FW"’ÂÆ–æUv–GFƒ¢7W'&VçBò"¢’¢æ÷fW&Æ’„6—&6ÆR‚’æf–ÆÂ†6ö×7Bò6öÆ÷"çv†—FR¢F†VÖRæ66VçB’æg&ÖR‡v–GFƒ¢6ö×7Bò’¢Â†V–v‡C¢6ö×7Bò’¢¢ç66ÆTVffV7B†f–ÆÆVBò¢ã"’æ÷6—G’†f–ÆÆVBò¢’¢æg&ÖR‡v–GFƒ¢6—¦RÂ†V–v‡C¢6—¦R²†6ö×7BòB¢‚’¢ææ–ÖF–öâ‡&VGV6TÖ÷F–öâòæ–Â¢ç7&–ær‡&W7öç6S¢ã#RÂF×–ætg&7F–öã¢ãr’ÂfÇVS¢f–ÆÆVB¢ææ–ÖF–öâ‡&VGV6TÖ÷F–öâòæ–Â¢æV6T÷WB†GW&F–öã¢ãR’ÂfÇVS¢7W'&VçB¢Ğ§Ğ ¢òòò6†÷'B6–FR×Fò×6–FR6†¶Rf÷"w&öær”âà§7G'V7B6†¶S¢vVöÖWG'”VffV7B°¢f"Ö÷VçC¢4tfÆö@¢f"æ–ÖF&ÆTFF¢4tfÆöB²vWB²Ö÷VçBÒ6WB²Ö÷VçBÒæWufÇVRÒĞ¢gVæ2VffV7EfÇVR‡6—¦S¢4u6—¦R’Óâ&ö¦V7F–öåG&ç6f÷&Ò°¢&ö¦V7F–öåG&ç6f÷&Ò„4tff–æUG&ç6f÷&Ò‡G&ç6ÆF–öåƒ¢’¢6–â†Ö÷VçB¢ç’¢b’Â“¢’¢Ğ§Ğ ¢òòòF†Rv–æF÷rw2”â6&BÂ6VçG&VB÷fW"Æ–v‡FÇ’F–ÖÖVBvRà§7G'V7B–å6†VWC¢f–Wr°¢Vçf—&öæÖVçDö&¦V7Bf"ÖöFVÃ¢eäÖöFVÀ¢Vçf—&öæÖVçB…Âæ66W76–&–Æ—G•&VGV6TÖ÷F–öâ’&—fFRf"&VGV6TÖ÷F–öà¢f"&öG“¢6öÖRf–Wr°¢¥7F6²°¢6öÆ÷"æ&Æ6²æ÷6—G’ƒã3"’æ–væ÷&W56fT&V‚’æöåFvW7GW&R²–bÖöFVÂç–ä'W7’²ÖöFVÂæ6æ6VÅ–â‚’ÒĞ¢çG&ç6—F–öâ‚æ÷6—G’¢e7F6²‡76–æs¢b’°¢–bÆWBW6W"ÒÖöFVÂçW6W"°¢fF%f–Wr†–ÖvS¢ÖöFVÂæfF"ÂæÖS¢W6W"æF—7Æ”æÖRÂ6—¦S¢Sb¢æ÷fW&Æ’„6—&6ÆR‚’ç7G&ö¶T&÷&FW"…F†VÖRæ&÷&FW"ÂÆ–æUv–GFƒ¢’¢Ğ¢e7F6²‡76–æs¢R’°¢FW‡B†ÖöFVÂç–å&WVW7Còç76‚ÓÒæ–Âò$VçFW"–÷W"”âFò6öææV7B"¢$VçFW"–÷W"”âFò6öææV7BæB÷Vâ54‚"¢æföçB…F†VÖRæföçBƒ’Âæ†Vg’’’æ×VÇF–Æ–æUFW‡DÆ–væÖVçB‚æ6VçFW"¢FW‡B‚%–÷W"6—‚ÖF–v—B„âw&÷W”â"¢æföçB…F†VÖRæföçBƒ2’’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB’æ×VÇF–Æ–æUFW‡DÆ–væÖVçB‚æ6VçFW"¢Ğ¢–äVçG'’‚¢¥7F6²°¢–bÖöFVÂç–ä'W7’²…7F6²‡76–æs¢‚’²&öw&W75f–Wr‚’æ6öçG&öÅ6—¦R‚ç6ÖÆÂ“²FW‡B‚$6†V6¶–æ~(
b"’Òæf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB’Ğ¢VÇ6R–bÆWBÖW76vRÒÖöFVÂç–äW'&÷"²FW‡B†ÖW76vR’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæFævW"’æ×VÇF–Æ–æUFW‡DÆ–væÖVçB‚æ6VçFW"’Ğ¢VÇ6R²FW‡B‚%–÷^(	—&R6¶VBWfW'’F–ÖR–÷R6öææV7Bâ"’æf÷&Vw&÷VæE7G–ÆR…F†VÖRæ×WFVB’Ğ¢Ğ¢æföçB…F†VÖRæföçBƒ"Âç6VÖ–&öÆB’’æg&ÖR†Ö–ä†V–v‡C¢‚¢'WGFöâ‚$6æ6VÂ"’²ÖöFVÂæ6æ6VÅ–â‚’Ğ¢æ'WGFöå7G–ÆR„„ä'WGFöå7G–ÆR‡&–Ö'“¢fÇ6R’¢æ¶W–&ö&E6†÷'F7WB‚æ6æ6VÄ7F–öâ¢æF—6&ÆVB†ÖöFVÂç–ä'W7’¢Ğ¢çFF–ær‚æ†÷&—¦öçFÂÂ3’çFF–ær‚çfW'F–6ÂÂ#b¢æg&ÖR‡v–GFƒ¢C¢æ&6¶w&÷VæB…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢#"Â7G–ÆS¢æ6öçF–çV÷W2’æf–ÆÂ…F†VÖRç7W&f6R’¢æ÷fW&Æ’†Æ–væÖVçC¢çF÷’²„å7G&—R‚’æg&ÖR††V–v‡C¢B’æ6Æ—6†R…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢#"Â7G–ÆS¢æ6öçF–çV÷W2’’Ğ¢æ÷fW&Æ’…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢#"Â7G–ÆS¢æ6öçF–çV÷W2’ç7G&ö¶T&÷&FW"…F†VÖRæ&÷&FW"’¢æ6Æ—6†R…&÷VæFVE&V7FævÆR†6÷&æW%&F—W3¢#"Â7G–ÆS¢æ6öçF–çV÷W2’¢ç6†F÷r†6öÆ÷#¢æ&Æ6²æ÷6—G’ƒã2’Â&F—W3¢3Â“¢b¢çG&ç6—F–öâ‡&VGV6TÖ÷F–öâòæ÷6—G’¢æ÷6—G’æ6öÖ&–æVB‡v—Fƒ¢ç66ÆR‡66ÆS¢ã“B’’æ6öÖ&–æVB‡v—Fƒ¢æöfg6WB‡“¢’’¢Ğ¢Ğ§Ğ ¢òòòF†RÖVçRw26ö×7B÷vW"7v—F6ƒ¢vÆ÷v–ær&÷VæB'WGFöâF†Bf–ÆÇ2v—F‚F†R'&æB6öÆ÷W"v†Vâöâà§7G'V7B÷vW%7v—F6ƒ¢f–Wr°¢ÆWBöã¢&ööÀ¢ÆWB'W7“¢&ööÀ¢7FFR&—fFRf"†÷fW"ÒfÇ6P¢f"&öG“¢6öÖRf–Wr°¢¥7F6²°¢6—&6ÆR‚’æf–ÆÂ†öâòç•6†U7G–ÆR…F†VÖRæ'&æB’¢ç•6†U7G–ÆR„6öÆ÷"çv†—FRæ÷6—G’ƒã‚’’¢6—&6ÆR‚’ç7G&ö¶T&÷&FW"†öâòç•6†U7G–ÆR…F†VÖRç&–ær’¢ç•6†U7G–ÆR„6öÆ÷"çv†—FRæ÷6—G’ƒã#"’’ÂÆ–æUv–GFƒ¢"ãR¢–b'W7’²&öw&W75f–Wr‚’æ6öçG&öÅ6—¦R‚ç6ÖÆÂ’çF–çB‚çv†—FR’Ğ¢VÇ6R²–ÖvR‡7—7FVÔæÖS¢'÷vW""’æföçB‚ç7—7FVÒ‡6—¦S¢#ÂvV–v‡C¢æ&öÆB’’æf÷&Vw&÷VæE7G–ÆR†öâò6öÆ÷"çv†—FR¢6öÆ÷"çv†—FRæ÷6—G’ƒã‚’’Ğ¢Ğ¢æg&ÖR‡v–GFƒ¢S‚Â†V–v‡C¢S‚¢ç6†F÷r†6öÆ÷#¢öâòF†VÖRçf–öÆWBæ÷6—G’ƒãb’¢æ6ÆV"Â&F—W3¢¢ç66ÆTVffV7B††÷fW"òãR¢¢ææ–ÖF–öâ‚æV6T÷WB†GW&F–öã¢ãR’ÂfÇVS¢†÷fW"¢æöä†÷fW"²†÷fW"ÒCĞ¢Ğ§Ğ ¢òòÔ$³¢Ò67&VVç6†÷G2‚Ò×6æ6†÷BÆföÆFW#â’ÂW6VB'’4’Fò6†V6²F†RFW6–và ¤Ö–ä7F÷ ¦VçVÒ6æ6†÷G2°¢7FF–2gVæ26×ÆR‡7FvS¢eäÖöFVÂå7FvRÒç&VG’Â6WEW¢&ööÂÒG'VRÂ6öææV7FVC¢&ööÂÒG'VRÂ6V7F–öã¢eäÖöFVÂå6V7F–öâÒæ6öææV7F–öâ’ÓâeäÖöFVÂ°¢ÆWBÒÒeäÖöFVÂ‡&Wf–Ws¢G'VR¢Òç7FvRÒ7FvP¢ÒçW6W"ÒW6W"†F—7Æ”æÖS¢$6†&Æ–RÆ—g6W’"ÂVÖ–Ã¢&6†&Æ–RæÆ—g6W”†æw&÷Wæ÷&rçV²"ÂFÖ–ã¢G'VRÂfF#¢æ–Â¢Òæ—56WEWÒ6WEW²Òæ6öææV7FVBÒ6öææV7FVC²Òç6V7F–öâÒ6V7F–öà¢òòv–FR6×ÆR–7GW&RÂFò6†V6²–7GW&W2f–ÆÂF†R6—&6ÆRv—F†÷WB7G&WF6†–ærà¢ÒæfF"Òå4–ÖvR‡6—¦S¢å56—¦R‡v–GFƒ¢#CÂ†V–v‡C¢c’ÂfÆ—VC¢fÇ6R’²"–à¢å4w&F–VçB†6öÆ÷'3¢´å46öÆ÷"…F†VÖRçFVÂ’Âå46öÆ÷"…F†VÖRçW'ÆR•Ò“òæG&r†–ã¢"ÂævÆS¢CR¢å46öÆ÷"çv†—FRçv—F„Ç†6ö×öæVçBƒãƒR’ç6WDf–ÆÂ‚“²å4&W¦–W%F‚†÷fÄ–ã¢å5&V7B‡ƒ¢ƒRÂ“¢CÂv–GFƒ¢sÂ†V–v‡C¢s’’æf–ÆÂ‚¢&WGW&âG'VP¢Ğ¢Òæ6öææV7FVE6–æ6RÒ6öææV7FVBòFFR‚’æFF–æuF–ÖT–çFW'fÂ‚ÓsSB’¢æ–À¢Òç6W'fW%&V6†&ÆRÒ6öææV7FVBòG'VR¢æ–À¢Òæ—Ò•–æfò†—¢6öææV7FVBò##rãSBã3Bã#R"¢#ƒbã"ãCã‚"Âf–gã¢6öææV7FVB¢ÒæFWf–6TæÖRÒ$6†&Æ–^(	—2Ö4&öö²&ò ¢ÆWBFWf–6W2Ò´FWf–6R†–C¢&"ÂæÖS¢$6†&Æ–^(	—2Ö4&öö²&ò"ÂFG&W73¢#ãƒ‚ãã""Â6öææV7FVC¢G'VRÂÆ7D†æG6†¶S¢•4óƒcFFTf÷&ÖGFW"‚’ç7G&–ær†g&öÓ¢FFR‚’’’À¢FWf–6R†–C¢&""ÂæÖS¢&•†öæR"ÂFG&W73¢#ãƒ‚ãã2"Â6öææV7FVC¢fÇ6RÂÆ7D†æG6†¶S¢æ–Â•Ğ¢ÒæFWf–6W2ÒFWf–6W0¢Òç&öf–ÆRÒ&öf–ÆR‡W6W#¢ÒçW6W"ÂFWf–6W3¢FWf–6W2ÂÆ–Ö—C¢RÀ¢6W76–öç3¢µ6–vä–äVçG'’†–C¢#"Â¶–æC¢&"Â7&VFVDC¢###bÓÓ•C“£#£¢"ÂÆ7EW6VDC¢###bÓÓ•Cc£C£¢"ÂfW'6–öã¢#"ã2ã"Â7W'&VçC¢G'VR’À¢6–vä–äVçG'’†–C¢#""Â¶–æC¢'vV""Â7&VFVDC¢###bÓÓ…CC£#£¢"ÂÆ7EW6VDC¢###bÓÓ…CC£3£¢"ÂfW'6–öã¢æ–ÂÂ7W'&VçC¢fÇ6R•ÒÀ¢7F—f—G“¢´7F—f—G’†C¢###bÓÓ•C“£#£¢"Â7F–öã¢'6–vâÖ–âæ"ÂFWF–Ã¢æ–Â’Â7F—f—G’†C¢###bÓÓ…CC£#£¢"Â7F–öã¢&FWf–6RæFB"ÂFWF–Ã¢æ–Â’Â7F—f—G’†C¢###bÓÓ…C3£Sƒ£¢"Â7F–öã¢'6–vâÖ–âçvV""ÂFWF–Ã¢æ–Â•Ò¢&WGW&âĞ¢Ğ ¢7FF–2gVæ26¶–ætf÷%–â…òÓ¢eäÖöFVÂ’ÓâeäÖöFVÂ²Òç–å&WVW7BÒeäÖöFVÂå–å&WVW7B‚“²&WGW&âÒĞ ¢7FF–2gVæ2&VæFW"‡FòföÆFW#¢U$Â’°¢G'“òf–ÆTÖævW"æFVfVÇBæ7&VFTF—&V7F÷'’†C¢föÆFW"Âv—F„–çFW&ÖVF–FTF—&V7F÷&–W3¢G'VR¢ÆWBvW3¢²…7G&–ærÂeäÖöFVÂÂ4u6—¦RÂ&ööÂ•ÒÒ°¢‚'vVÆ6öÖR"Â6×ÆR‡7FvS¢ç6–vä–âÂ6WEW¢fÇ6RÂ6öææV7FVC¢fÇ6R’Â4u6—¦R‡v–GFƒ¢“ƒÂ†V–v‡C¢cc’ÂfÇ6R’À¢‚&6öææV7FVB"Â6×ÆR‚’Â4u6—¦R‡v–GFƒ¢CÂ†V–v‡C¢sc’ÂfÇ6R’À¢‚&F—66öææV7FVB"Â6×ÆR†6öææV7FVC¢fÇ6R’Â4u6—¦R‡v–GFƒ¢CÂ†V–v‡C¢sc’ÂfÇ6R’À¢‚'6WGW"Â6×ÆR‡6WEW¢fÇ6RÂ6öææV7FVC¢fÇ6R’Â4u6—¦R‡v–GFƒ¢CÂ†V–v‡C¢sc’ÂfÇ6R’À¢‚'76‚"Â6×ÆR‡6V7F–öã¢ç76‚’Â4u6—¦R‡v–GFƒ¢CÂ†V–v‡C¢sc’ÂfÇ6R’À¢‚'&öf–ÆR"Â6×ÆR‡6V7F–öã¢ç&öf–ÆR’Â4u6—¦R‡v–GFƒ¢CÂ†V–v‡C¢ƒc’ÂfÇ6R’À¢‚'6WGF–æw2"Â6×ÆR‡6V7F–öã¢ç6WGF–æw2’Â4u6—¦R‡v–GFƒ¢CÂ†V–v‡C¢s’ÂfÇ6R’À¢‚'–â"Â6¶–ætf÷%–â‡6×ÆR†6öææV7FVC¢fÇ6R’’Â4u6—¦R‡v–GFƒ¢CÂ†V–v‡C¢sc’ÂfÇ6R’À¢Ğ¢f÷"F&²–â·G'VRÂfÇ6UÒ°¢6†ö÷B„FWf–6TvFUf–Wr†vFS¢FWf–6TvFR‡&Wf–Ws¢G'VRÂ7FGW3¢çVæÆ–æ¶VBÂ6öFS¢$$4BÓ#3CR"’’æ&6¶w&÷VæB…F†VÖRæ&6¶w&÷VæB’æf÷&Vw&÷VæE7G–ÆR…F†VÖRçFW‡B’Â6—¦S¢4u6—¦R‡v–GFƒ¢“#Â†V–v‡C¢cC’ÂF&³¢F&²ÂFó¢föÆFW"æVæF–æuF„6ö×öæVçB‚&FWf–6RÖæ÷BÖWF†÷&—6VBÕÂ†F&²ò&F&²"¢&Æ–v‡B"’çær"’¢6†ö÷B„FWf–6TvFUf–Wr†vFS¢FWf–6TvFR‡&Wf–Ws¢G'VRÂ7FGW3¢çVæÆ–æ¶VBÂ6öFS¢$$4BÓ#3CR"’Â6ö×7C¢G'VR’æ&6¶w&÷VæB…F†VÖRæ&6¶w&÷VæB’æf÷&Vw&÷VæE7G–ÆR…F†VÖRçFW‡B’Â6—¦S¢4u6—¦R‡v–GFƒ¢3#Â†V–v‡C¢C#’ÂF&³¢F&²ÂFó¢föÆFW"æVæF–æuF„6ö×öæVçB‚&ÖVçRÖFWf–6RÕÂ†F&²ò&F&²"¢&Æ–v‡B"’çær"’¢f÷"†æÖRÂÖöFVÂÂ6—¦RÂò’–âvW2°¢6†ö÷B„Ö–åf–Wr‚’æVçf—&öæÖVçDö&¦V7B†ÖöFVÂ’Â6—¦S¢6—¦RÂF&³¢F&²ÂFó¢föÆFW"æVæF–æuF„6ö×öæVçB‚%Â†æÖR’ÕÂ†F&²ò&F&²"¢&Æ–v‡B"’çær"’¢Ğ¢ÆWBÖVçTÖöFVÂÒ6×ÆR‚¢6†ö÷B„ÖVçUf–Wr‚’æVçf—&öæÖVçDö&¦V7B†ÖVçTÖöFVÂ’Â6—¦S¢4u6—¦R‡v–GFƒ¢3#Â†V–v‡C¢#“’ÂF&³¢F&²ÂFó¢föÆFW"æVæF–æuF„6ö×öæVçB‚&ÖVçRÕÂ†F&²ò&F&²"¢&Æ–v‡B"’çær"’¢ÆWB–äÖVçRÒ6¶–ætf÷%–â‡6×ÆR†6öææV7FVC¢fÇ6R’¢6†ö÷B„ÖVçUf–Wr‚’æVçf—&öæÖVçDö&¦V7B‡–äÖVçR’Â6—¦S¢4u6—¦R‡v–GFƒ¢3#Â†V–v‡C¢3’ÂF&³¢F&²ÂFó¢föÆFW"æVæF–æuF„6ö×öæVçB‚&ÖVçR×–âÕÂ†F&²ò&F&²"¢&Æ–v‡B"’çær"’¢Ğ¢Ğ ¢7FF–2gVæ26†ö÷CÅc¢f–Wsâ…òf–Ws¢bÂ6—¦S¢4u6—¦RÂF&³¢&ööÂÂFòW&Ã¢U$Â’°¢ÆWB†÷7BÒå4†÷7F–æuf–Wr‡&ö÷Ef–Ws¢f–Wræg&ÖR‡v–GFƒ¢6—¦Rçv–GF‚Â†V–v‡C¢6—¦Ræ†V–v‡B’¢†÷7Bæg&ÖRÒ4u&V7B†÷&–v–ã¢ç¦W&òÂ6—¦S¢6—¦R¢ÆWBv–æF÷rÒå5v–æF÷r†6öçFVçE&V7C¢†÷7Bæg&ÖRÂ7G–ÆTÖ6³¢²æ&÷&FW&ÆW75ÒÂ&6¶–æs¢æ'VffW&VBÂFVfW#¢fÇ6R¢v–æF÷ræV&æ6RÒå4V&æ6R†æÖVC¢F&²òæF&´V¢æV¢v–æF÷ræ6öçFVçEf–WrÒ†÷7@¢v–æF÷rç6WDg&ÖT÷&–v–â„å5ö–çB‡ƒ¢Ó#Â“¢Ó#’¢v–æF÷ræ÷&FW$g&öçE&Vv&FÆW72‚¢†÷7BæÆ–÷WE7V'G&VT–dæVVFVB‚¢'VäÆö÷æ7W'&VçBç'Vâ‡VçF–Ã¢FFR‚’æFF–æuF–ÖT–çFW'fÂƒã"’¢wV&BÆWB&WÒ†÷7Bæ&—FÖ–ÖvU&Wf÷$66†–ætF—7Æ’†–ã¢†÷7Bæ&÷VæG2’VÇ6R²&WGW&âĞ¢†÷7Bæ66†TF—7Æ’†–ã¢†÷7Bæ&÷VæG2ÂFó¢&W¢G'“ò&Wç&W&W6VçFF–öâ‡W6–æs¢çærÂ&÷W'F–W3¢³¥Ò“òçw&—FR‡Fó¢W&Â¢v–æF÷ræ÷&FW$÷WB†æ–Â¢Ğ§Ğ ¢òòò6ögB&÷VæBvÆ÷r†&F–Âw&F–VçBÂ6ò—BÆöö·2F†R6ÖRWfW'—v†W&RÂ67&VVç6†÷G2–æ6ÇVFVB’à§7G'V7BvÆ÷s¢f–Wr°¢ÆWB6öÆ÷#¢6öÆ÷ ¢ÆWB6—¦S¢4tfÆö@¢f"&öG“¢6öÖRf–Wr°¢&F–Äw&F–VçB†6öÆ÷'3¢¶6öÆ÷"Â6öÆ÷"æ÷6—G’ƒ•ÒÂ6VçFW#¢æ6VçFW"Â7F'E&F—W3¢ÂVæE&F—W3¢6—¦Rò"¢æg&ÖR‡v–GFƒ¢6—¦RÂ†V–v‡C¢6—¦R¢æÆÆ÷w4†—EFW7F–ær†fÇ6R¢Ğ§Ğ 