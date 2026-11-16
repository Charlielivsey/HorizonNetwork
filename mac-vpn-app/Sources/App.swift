import SwiftUI
import AppKit
import ServiceManagement
import Darwin

/// HN Secure Access Terminal for HN Group staff: the HN Group VPN (a private link to the server) and
/// SSH to the server, in a full app window with its terminal mark in the menu bar for quick access.
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
                Button("Check for Updates…") { Task { model.show(.settings); await model.checkForUpdate() } }
            }
        }

        MenuBarExtra {
            MenuView().environmentObject(model)
        } label: {
            MenuBarMark(connected: model.connected, busy: model.busy)
                .accessibilityLabel(model.busy ? "HN Secure Access Terminal: changing connection" : model.connected ? "HN Secure Access Terminal: connected" : "HN Secure Access Terminal: not connected")
                .help(model.busy ? "Changing connection…" : model.connected ? "HN Secure Access Terminal · Connected" : "HN Secure Access Terminal · Not connected")
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
        if args.contains("--test-window-lifecycle") {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 300_000_000)
                await WindowLifecycleChecks.run()
                NSApp.terminate(nil)
            }
        }
        if let i = args.firstIndex(of: "--snapshot"), i + 1 < args.count {
            Task { @MainActor in Snapshots.render(to: URL(fileURLWithPath: args[i + 1])); NSApp.terminate(nil) }
        }
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        MainWindowPresence.shared.reopen()
        for url in urls {
            Task { @MainActor in await VPNModel.shared.completeSignIn(url) }
        }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        MainWindowPresence.shared.reopen()
        return false
    }
    // Closing the window keeps the VPN (and the menu bar icon) running.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

/// Main-window visibility owns Dock presence; menu panels and temporary SSH windows do not.
@MainActor
final class MainWindowPresence {
    static let shared = MainWindowPresence()
    private weak var mainWindow: NSWindow?
    private var observers: [NSObjectProtocol] = []
    func register(_ window: NSWindow) {
        guard mainWindow !== window else { return }
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        mainWindow = window
        window.isReleasedWhenClosed = false
        observers = [
            NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) { [weak self] _ in
                DispatchQueue.main.async {
                    guard let window = self?.mainWindow, !window.isVisible else { return }
                    NSApp.setActivationPolicy(.accessory)
                }
            },
            NotificationCenter.default.addObserver(forName: NSWindow.didBecomeKeyNotification, object: window, queue: .main) { _ in
                NSApp.setActivationPolicy(.regular)
            }
        ]
    }
    func reopen() {
        NSApp.setActivationPolicy(.regular)
        mainWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
struct MainWindowRegistration: NSViewRepresentable {
    func makeNSView(context: Context) -> RegistrationView { RegistrationView() }
    func updateNSView(_ view: RegistrationView, context: Context) {}
    final class RegistrationView: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window = window { MainWindowPresence.shared.register(window) }
        }
    }
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
        .background(MainWindowRegistration())
        .font(Theme.font(14))
        .foregroundStyle(Theme.text)
        .ignoresSafeArea(.container, edges: .top)
    }
}

struct WelcomeView: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 24) {
                HNWordmark(height: 34)
                Spacer()
                Image(systemName: "terminal.fill").font(.system(size: 38, weight: .medium)).foregroundStyle(Theme.accent)
                Text("Your connection.\nYour workspace.").font(Theme.font(30, .bold)).tracking(-0.7)
                Text("A private connection to HN Group’s network, with server access close at hand.")
                    .font(Theme.font(14)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                HNStripe().frame(height: 3).padding(.top, 12)
                Spacer()
                Text("HN SECURE ACCESS TERMINAL").font(Theme.font(9, .bold)).tracking(1.3).foregroundStyle(Theme.muted)
            }
            .padding(36).frame(width: 330).background(Theme.sidebar)
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    PageTitle(eyebrow: "Get started", title: model.stage == .waiting ? "Continue in your browser" : "Welcome to Secure Access", text: model.stage == .waiting ? "Finish signing in with HN Group Auth, then allow your browser to return to this app." : "Sign in with your staff account to connect this Mac.")
                    if model.stage == .waiting {
                        HStack(spacing: 10) { ProgressView().controlSize(.small); Text("Waiting for sign-in…").font(Theme.font(13)).foregroundStyle(Theme.muted) }
                        Button("Reopen sign-in page") { model.signIn() }.buttonStyle(HNButtonStyle(wide: true))
                        Button("Cancel sign-in") { model.cancelSignIn() }.buttonStyle(.plain).foregroundStyle(Theme.muted)
                    } else {
                        Feature(icon: "lock.shield", title: "WireGuard VPN", text: "Connect to HN Group’s UK server.")
                        Feature(icon: "terminal", title: "Direct SSH access", text: "Open Terminal with a one-use password.")
                        Feature(icon: "menubar.rectangle", title: "Always within reach", text: "Close the window and keep working from the menu bar.")
                        Button { model.signIn() } label: { Label("Sign in with HN Group Auth", systemImage: "arrow.up.right") }
                            .buttonStyle(HNButtonStyle(wide: true)).keyboardShortcut(.defaultAction)
                    }
                    if let error = model.error { Banner(kind: .error, icon: "exclamationmark.circle", title: error) }
                    Text(AppInfo.label).font(Theme.font(11)).foregroundStyle(Theme.muted)
                }.padding(36).frame(maxWidth: 510)
            }.frame(maxWidth: .infinity)
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
                        .transition(.opacity)
                    }
                    .padding(.horizontal, 28).padding(.top, 46).padding(.bottom, 28)
                    .frame(maxWidth: 940, alignment: .leading)
                    .frame(maxWidth: .infinity)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: model.section)
                }
            }
        }
    }

    @ViewBuilder private var notices: some View {
        if let release = model.update {
            Banner(kind: .info, icon: "arrow.down.circle.fill",
                   title: "Secure Access Terminal \(release.version) is ready",
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

/// Metrics and structure mirror portal-ui.css: brand, workspace navigation, and account footer.
struct Sidebar: View {
    @EnvironmentObject var model: VPNModel
    @Namespace private var selection
    @State private var accountOpen = false
    @State private var accountHover = false
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 15) {
                HNWordmark(height: 43).frame(width: 126, alignment: .leading)
                HStack(spacing: 10) {
                    Text("Secure Access workspace")
                        .font(Theme.font(12, .bold)).tracking(0.36).foregroundStyle(Theme.muted)
                    Circle().fill(Theme.pink).frame(width: 6, height: 6)
                }
            }
            // Leave room for the native macOS window controls above the shared brand header.
            .padding(.horizontal, 24).padding(.top, 48).padding(.bottom, 22)

            ScrollView {
                VStack(alignment: .leading, spacing: 3) {
                    Text("YOUR WORKSPACE")
                        .font(Theme.font(9, .heavy)).tracking(1.26).foregroundStyle(Theme.muted)
                        .padding(.horizontal, 11).padding(.bottom, 7)
                    NavItem(icon: "power", title: "Connection", section: .connection, selection: selection)
                    NavItem(icon: "terminal", title: "SSH", section: .ssh, selection: selection)
                    NavItem(icon: "person.crop.circle", title: "Profile", section: .profile, selection: selection)
                    NavItem(icon: "gearshape", title: "Settings", section: .settings, selection: selection, dot: model.update != nil)
                }
                .padding(.top, 12).padding(.bottom, 16)
            }
            .padding(.horizontal, 13)

            VStack(spacing: 10) {
                HStack(spacing: 7) {
                    Circle().fill(model.connected ? Theme.green : Theme.muted).frame(width: 6, height: 6)
                    Text(model.connected ? "Connected" : model.isSetUp ? "Disconnected" : "Not set up yet")
                        .font(Theme.font(10, .semibold))
                    Spacer()
                    Text(model.connected ? "VPN on" : "VPN off").font(Theme.font(9))
                }
                .foregroundStyle(Theme.muted).padding(.horizontal, 8)
                Button { accountOpen.toggle() } label: {
                    HStack(spacing: 10) {
                        AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 30)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(model.user?.displayName ?? "Signed in").font(Theme.font(11, .bold))
                                .foregroundStyle(Theme.text).lineLimit(1)
                            Text("Your account").font(Theme.font(9)).foregroundStyle(Theme.muted)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.down").font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Theme.muted).rotationEffect(.degrees(accountOpen ? 180 : 0))
                    }
                    .padding(8).frame(minHeight: 50)
                    .background(RoundedRectangle(cornerRadius: 10).fill(accountOpen || accountHover ? Theme.surface2 : Color.clear))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain).onHover { accountHover = $0 }
                .accessibilityLabel("Your account")
                .accessibilityValue(accountOpen ? "Expanded" : "Collapsed")
                .popover(isPresented: $accountOpen, arrowEdge: .trailing) {
                    WorkspaceAccountPanel { accountOpen = false }.environmentObject(model)
                }
            }
            .padding(.horizontal, 13).padding(.vertical, 10)
            .overlay(alignment: .top) { Rectangle().fill(Theme.border).frame(height: 1) }
        }
        .frame(width: 238)
        .background(Theme.surface)
        .animation(.easeOut(duration: 0.18), value: accountOpen)
    }
}

/// The compact account panel shared by the HN workspaces, with native popover dismissal.
struct WorkspaceAccountPanel: View {
    @EnvironmentObject var model: VPNModel
    var close: () -> Void = {}
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("YOUR ACCOUNT").font(Theme.font(10, .bold)).tracking(0.9)
                .foregroundStyle(Theme.muted).padding(.horizontal, 10).padding(.bottom, 8)
            Text(model.user?.email ?? "").font(Theme.font(12)).foregroundStyle(Theme.muted)
                .textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 10).padding(.bottom, 18)
            HStack(spacing: 8) {
                Circle().fill(model.connected ? Theme.green : Theme.muted).frame(width: 7, height: 7)
                Text(model.connected ? "VPN connected" : "VPN disconnected").font(Theme.font(12, .semibold))
                Spacer()
            }
            .foregroundStyle(Theme.text).padding(14)
            .background(RoundedRectangle(cornerRadius: 10).fill(Theme.surface2))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.border))
            .padding(.bottom, 14)
            WorkspaceAccountAction(icon: "person", title: "HN Account", external: true) {
                close(); NSWorkspace.shared.open(URL(string: "https://accounts.hngroup.org.uk")!)
            }
            WorkspaceAccountAction(icon: "person.crop.circle", title: "Profile") { close(); model.show(.profile) }
            WorkspaceAccountAction(icon: "gearshape", title: "Settings") { close(); model.show(.settings) }
            WorkspaceAccountAction(icon: "rectangle.portrait.and.arrow.right", title: "Sign out") {
                close(); Task { await model.signOut() }
            }
            .disabled(model.busy)
            Rectangle().fill(Theme.border).frame(height: 1).padding(.top, 8).padding(.bottom, 12)
            WorkspaceAccountAction(icon: nil, title: "Explore all HN sites", external: true, small: true) {
                close(); NSWorkspace.shared.open(URL(string: "https://sites.hngroup.org.uk")!)
            }
        }
        .padding(.horizontal, 12).padding(.top, 18).padding(.bottom, 12)
        .frame(width: 320).background(Theme.surface)
    }
}

struct WorkspaceAccountAction: View {
    let icon: String?
    let title: String
    var external = false
    var small = false
    let action: () -> Void
    @State private var hover = false
    var body: some View {
        Button(action: action) {
            HStack(spacing: 11) {
                if let icon = icon {
                    Image(systemName: icon).font(.system(size: 16)).frame(width: 18).opacity(0.8)
                }
                Text(title).font(Theme.font(small ? 11 : 12, small ? .regular : .semibold))
                Spacer()
                if external { Image(systemName: "arrow.up.right").font(.system(size: 12)).opacity(0.65) }
            }
            .foregroundStyle(hover ? Theme.text : Theme.muted)
            .padding(10).frame(minHeight: small ? 34 : 42)
            .background(RoundedRectangle(cornerRadius: 9).fill(hover ? Theme.surface2 : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).onHover { hover = $0 }
    }
}

struct NavItem: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let icon: String
    let title: String
    let section: VPNModel.Section
    let selection: Namespace.ID
    var dot = false
    @State private var hover = false
    var body: some View {
        let selected = model.section == section
        Button { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { model.show(section) } } label: {
            HStack(spacing: 11) {
                Image(systemName: icon).font(.system(size: 16)).frame(width: 16).opacity(selected ? 1 : 0.8)
                Text(title).font(Theme.font(11, selected ? .bold : .semibold))
                Spacer()
                if dot { Circle().fill(Theme.pink).frame(width: 6, height: 6) }
            }
            .foregroundStyle(selected ? Theme.accent : hover ? Theme.text : Theme.muted)
            .padding(.horizontal, 11).padding(.vertical, 7).frame(minHeight: 34)
            .background {
                if selected {
                    RoundedRectangle(cornerRadius: 9).fill(Theme.accentSoft)
                        .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(Theme.accent.opacity(0.2)))
                        .matchedGeometryEffect(id: "selection", in: selection)
                } else if hover {
                    RoundedRectangle(cornerRadius: 9).fill(Theme.surface2)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).onHover { hover = $0 }
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

struct PageTitle: View {
    let eyebrow: String
    let title: String
    var text: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eyebrow).font(Theme.font(9, .bold)).tracking(1.2).textCase(.uppercase).foregroundStyle(Theme.accent)
            Text(title).font(Theme.font(25, .bold)).tracking(-0.5)
            if let text = text { Text(text).font(Theme.font(13)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true) }
        }
        .padding(.bottom, 4)
    }
}

// MARK: - Connection

struct ConnectionPage: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(eyebrow: "Your workspace", title: "Connection", text: "Your Mac’s link to the HN Group network.")
            if !model.wireGuardInstalled || !model.isSetUp {
                SetupCard()
            } else {
                ConnectCard()
                HStack { Text("CONNECTION DETAILS").font(Theme.font(9, .bold)).tracking(1.2).foregroundStyle(Theme.muted); Spacer() }
                    .padding(.top, 4)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    InfoTile(icon: "server.rack", label: "VPN server", value: "United Kingdom", note: VPNModel.serverAddress, good: model.connected)
                    InfoTile(icon: "laptopcomputer", label: "This Mac", value: model.deviceName ?? "This device", note: "Private key stored on this Mac")
                }
                Card {
                    HStack(spacing: 14) {
                        Image(systemName: "terminal").font(.system(size: 21)).foregroundStyle(Theme.accent)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Server access").font(Theme.font(14, .bold))
                            Text(model.connected ? (model.serverReachable == true ? "The server is ready for SSH." : model.serverReachable == false ? "The server is not responding yet." : "Checking server availability…") : "Connect to the VPN before opening a server session.")
                                .font(Theme.font(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 10)
                        Button("Open SSH") { model.show(.ssh) }.buttonStyle(HNButtonStyle(primary: false))
                    }
                }
                Text("Closing this window keeps the VPN and menu-bar controls running.")
                    .font(Theme.font(11)).foregroundStyle(Theme.muted)
            }
        }
    }
}

struct SetupCard: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 16) {
                HStack { SectionHeading(title: "Prepare this Mac", icon: "laptopcomputer"); Spacer(); Badge(text: model.wireGuardInstalled ? "Step 2 of 2" : "Step 1 of 2") }
                StepRow(number: 1, done: model.wireGuardInstalled, active: !model.wireGuardInstalled, title: "Install WireGuard", text: "Install the VPN tools in Terminal, then return here.") {
                    Button("Install tools") { model.installWireGuard() }.buttonStyle(HNButtonStyle())
                }
                StepRow(number: 2, done: false, active: model.wireGuardInstalled, title: "Register this Mac", text: "Create this Mac’s private connection. macOS will ask for your Mac password.") {
                    Button { Task { await model.setUp() } } label: {
                        HStack(spacing: 8) { if model.busy { ProgressView().controlSize(.small) }; Text(model.busy ? "Setting up…" : "Set up this Mac") }
                    }.buttonStyle(HNButtonStyle()).disabled(model.busy || !model.wireGuardInstalled)
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
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: model.connected ? "network.badge.shield.half.filled" : "network")
                    .font(.system(size: 25, weight: .medium)).foregroundStyle(model.connected ? Theme.success : Theme.accent)
                    .frame(width: 52, height: 52).background(RoundedRectangle(cornerRadius: 14).fill(Theme.surface2))
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.busy ? "Updating connection…" : model.connected ? "VPN connected" : "Ready to connect")
                        .font(Theme.font(23, .bold)).tracking(-0.5)
                    Text(model.connected ? "WireGuard is running on this Mac." : "Connect to HN Group’s United Kingdom server.")
                        .font(Theme.font(13)).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                Circle().fill(model.connected ? Theme.success : Theme.muted).frame(width: 8, height: 8).padding(.top, 8)
            }
            Rectangle().fill(Theme.border).frame(height: 1)
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    if model.connected, let since = model.connectedSince {
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            Text(Self.duration(context.date.timeIntervalSince(since))).font(Theme.font(12, .semibold).monospacedDigit())
                        }
                    } else { Text("PIN required to connect").font(Theme.font(12, .semibold)) }
                    Text(model.connected ? "You can manage your connection from the menu bar." : "Use your six-digit HN Group PIN.")
                        .font(Theme.font(11)).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 8)
                if model.busy { ProgressView().controlSize(.small) }
                Button { Task { await model.toggle() } } label: {
                    Label(model.connected ? "Disconnect" : "Connect VPN", systemImage: "power")
                }.buttonStyle(HNButtonStyle(primary: !model.connected)).disabled(model.busy || model.sshBusy)
            }
        }
        .padding(22).background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
        .overlay(alignment: .top) { HNStripe().frame(height: 3).clipShape(RoundedRectangle(cornerRadius: 2)).padding(.horizontal, 22) }
    }
    static func duration(_ t: TimeInterval) -> String {
        let s = max(0, Int(t)); let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "Connected for %d:%02d:%02d", h, m, sec) : String(format: "Connected for %02d:%02d", m, sec)
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
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(eyebrow: "Server access", title: "SSH", text: "Open a session on the HN Group server in Terminal.")
            Card {
                HStack(spacing: 12) {
                    Image(systemName: "server.rack").font(.system(size: 22)).foregroundStyle(Theme.accent)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("HN Group server").font(Theme.font(14, .bold))
                        Text(VPNModel.serverAddress + " · port 22").font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Badge(text: !model.connected ? "VPN required" : model.serverReachable == true ? "Available" : model.serverReachable == false ? "Unavailable" : "Checking", colour: model.serverReachable == true && model.connected ? Theme.success : Theme.muted)
                }
            }
            Card {
                VStack(alignment: .leading, spacing: 18) {
                    SectionHeading(title: "Start a session", icon: "terminal")
                    HStack(alignment: .top, spacing: 14) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Username").font(Theme.font(12, .semibold)).foregroundStyle(Theme.muted)
                            TextField("root", text: $model.sshUser).textFieldStyle(.plain).disableAutocorrection(true)
                                .focused($focus, equals: .user).onSubmit { focus = .password }
                                .padding(12).background(RoundedRectangle(cornerRadius: 10).fill(Theme.background))
                                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(focus == .user ? Theme.accent : Theme.border))
                        }.frame(maxWidth: 180)
                        VStack(alignment: .leading, spacing: 7) {
                            Text("Server password").font(Theme.font(12, .semibold)).foregroundStyle(Theme.muted)
                            SecureField("Enter password", text: $password).textFieldStyle(.plain)
                                .focused($focus, equals: .password).onSubmit(go)
                                .padding(12).background(RoundedRectangle(cornerRadius: 10).fill(Theme.background))
                                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(focus == .password ? Theme.accent : Theme.border))
                        }
                    }
                    HStack(spacing: 12) {
                        Button(action: go) { Label(model.connected ? "Open SSH" : "Connect & open SSH", systemImage: "arrow.up.right") }
                            .buttonStyle(HNButtonStyle()).keyboardShortcut(.defaultAction).disabled(!ready)
                        if model.sshBusy { ProgressView().controlSize(.small) }
                        Spacer()
                    }
                    if !model.isSetUp {
                        Button("Set up this Mac first") { model.show(.connection) }.buttonStyle(.plain).foregroundStyle(Theme.accent)
                    } else if !model.connected {
                        Text("You’ll be asked for your HN Group PIN before the VPN connects.").font(Theme.font(11)).foregroundStyle(Theme.muted)
                    }
                }
            }
            Feature(icon: "key.slash", title: "Used once, then cleared", text: "Your server password is never saved in the app. Terminal opens separately.")
            Feature(icon: "checkmark.shield", title: "Server identity checked", text: "The SSH session remembers the server’s host key.")
        }
        .onAppear { focus = .password }
        .onDisappear { password = "" }
    }
    private func go() {
        guard ready else { return }
        let typed = password; password = ""
        Task { await model.openSSH(password: typed) }
    }
}

struct StatusPill: View {
    let on: Bool
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(on ? Theme.green : Color.white.opacity(0.35)).frame(width: 7, height: 7).shadow(color: on ? Theme.green : .clear, radius: 4)
            Text(text).font(Theme.font(11, .bold))
        }
        .foregroundStyle(.white.opacity(0.75))
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(Capsule().fill(Color.white.opacity(0.07)))
    }
}

struct Chip: View {
    let icon: String
    let text: String
    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: icon).font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.accent)
            Text(text).font(Theme.font(12, .semibold)).foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Capsule().fill(Theme.surface))
        .overlay(Capsule().strokeBorder(Theme.border.opacity(0.8)))
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
    private let labels = ["sign-in.web": "Signed in on the website", "sign-in.app": "Signed in to Secure Access Terminal", "sign-out.other": "Signed out another sign-in",
                          "device.add": "Added a device", "device.remove": "Removed a device", "mac-app.publish": "Published a Secure Access Terminal build"]
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            PageTitle(eyebrow: "Your account", title: "Profile", text: "Manage your devices and active sign-ins.")
            Card {
                HStack(spacing: 16) {
                    AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 52)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(model.user?.displayName ?? "").font(Theme.font(19, .bold))
                        Text(model.user?.email ?? "").font(Theme.font(12)).foregroundStyle(Theme.muted).lineLimit(1).truncationMode(.middle)
                    }
                    Spacer(minLength: 8)
                    Button("HN Account ↗") { NSWorkspace.shared.open(URL(string: "https://accounts.hngroup.org.uk")!) }
                        .buttonStyle(HNButtonStyle(primary: false))
                }
            }
            if let p = model.profile {
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: "Where you’re signed in", icon: "key.fill")
                        ForEach(p.sessions) { s in
                            ListRow(icon: s.kind == "app" ? "laptopcomputer" : "globe",
                                    title: (s.kind == "app" ? "Secure Access Terminal" + (s.appVersion.map { " " + $0 } ?? "") : "Website") + (s.current ? " · this Mac" : ""),
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

/// A readable labelled pill: an icon and sentence-case text on a soft tint, never wrapping.
struct Pill: View {
    let icon: String
    let text: String
    var colour: Color = Theme.accent
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 11, weight: .bold))
            Text(text).font(Theme.font(12.5, .bold))
        }
        .foregroundStyle(colour)
        .lineLimit(1).fixedSize()
        .padding(.horizontal, 11).padding(.vertical, 6)
        .background(Capsule().fill(colour.opacity(0.14)))
        .overlay(Capsule().strokeBorder(colour.opacity(0.3)))
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
            PageTitle(eyebrow: "Preferences", title: "Settings", text: "Make Secure Access work your way.")
            Card {
                HStack(spacing: 16) {
                    AppMark(size: 42)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("HN Secure Access Terminal").font(Theme.font(15, .bold))
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
                            Text("Launch at login").font(Theme.font(14, .semibold))
                            Text("Keep the menu-bar controls ready when your Mac starts.").font(Theme.font(12)).foregroundStyle(Theme.muted)
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

/// A stable menu-bar panel: switching views never changes the native window's size.
struct MenuView: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.openWindow) private var openWindow
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject var gate = DeviceGate.shared
    @State private var sshPrompt = false
    @State private var sshPassword = ""
    static let width: CGFloat = 352
    static let height: CGFloat = 432
    init(showSSH: Bool = false) { _sshPrompt = State(initialValue: showSSH) }

    var body: some View {
        VStack(spacing: 0) {
            if !gate.allowed {
                HNStripe().frame(height: 2)
                ScrollView { DeviceGateView(gate: gate, compact: true) }
            } else {
                header
                HNStripe().frame(height: 2)
                ScrollView(.vertical) {
                    Group {
                        if model.stage == .ready && model.pinRequest != nil {
                            pinForm
                        } else if sshPrompt && model.stage == .ready && model.isSetUp {
                            MenuSSHForm(password: $sshPassword, cancel: cancelSSH, submit: submitSSH)
                        } else {
                            home
                        }
                    }
                    .padding(16).frame(maxWidth: .infinity, alignment: .topLeading)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                Rectangle().fill(Theme.border).frame(height: 1)
                HStack {
                    Button { NSWorkspace.shared.open(API.base) } label: {
                        Label("VPN website", systemImage: "arrow.up.right")
                    }
                    .buttonStyle(.plain).foregroundStyle(Theme.muted)
                    Spacer()
                    Button("Quit") { NSApplication.shared.terminate(nil) }
                        .buttonStyle(.plain).foregroundStyle(Theme.muted).keyboardShortcut("q")
                }
                .font(Theme.font(11, .semibold)).padding(.horizontal, 16).frame(height: 40)
            }
        }
        .frame(width: Self.width, height: Self.height)
        .background(Theme.background)
        .foregroundStyle(Theme.text)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Theme.border))
        .background(MenuWindowAnchor(enabled: !model.preview))
        .onDisappear { sshPassword = ""; sshPrompt = false }
        .onChange(of: model.stage) { if $0 != .ready { cancelSSH() } }
        .onChange(of: gate.allowed) { if !$0 { cancelSSH() } }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 5) {
                    HNWordmark(height: 22)
                    Text("SECURE ACCESS TERMINAL").font(Theme.font(8, .bold)).tracking(1)
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
                if let user = model.user, model.stage == .ready {
                    AvatarView(image: model.avatar, name: user.displayName, size: 30)
                }
            }
            HStack(spacing: 12) {
                Button { Task { await model.toggle() } } label: {
                    ZStack {
                        RoundedRectangle(cornerRadius: 13).fill(model.connected ? Theme.accentSoft : Theme.surface2)
                        if model.busy { ProgressView().controlSize(.small) }
                        else { Image(systemName: "power").font(.system(size: 22, weight: .medium)) }
                    }
                    .foregroundStyle(model.connected ? Theme.accent : Theme.muted).frame(width: 46, height: 46)
                }
                .buttonStyle(.plain)
                .disabled(model.busy || model.sshBusy || model.pinRequest != nil || model.stage != .ready || !model.isSetUp)
                .accessibilityLabel(model.connected ? "Disconnect VPN" : "Connect VPN")
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.busy ? "Connecting…" : model.connected ? "Connected" : "Not connected")
                        .font(Theme.font(18, .bold))
                    Text(model.connected ? "United Kingdom server" : "Your HN network connection")
                        .font(Theme.font(11)).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                Circle().fill(model.connected ? Theme.green : Theme.muted).frame(width: 7, height: 7)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface)
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.stage == .ready && model.isSetUp {
                HStack {
                    Image(systemName: "server.rack").foregroundStyle(Theme.accent).font(.system(size: 17))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("HN Group server").font(Theme.font(11, .semibold))
                        Text(VPNModel.serverAddress).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Text(model.connected ? (model.serverReachable == true ? "SSH ready" : "Checking…") : "VPN required")
                        .font(Theme.font(10, .semibold)).foregroundStyle(Theme.muted)
                }
                .padding(12).background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Theme.border))
                Button {
                    model.error = nil; sshPassword = ""; sshPrompt = true
                } label: {
                    Label("SSH to the server", systemImage: "terminal").frame(maxWidth: .infinity)
                }
                .buttonStyle(MenuActionStyle(primary: true)).disabled(model.busy || model.sshBusy)
            } else {
                Text(model.stage == .ready ? "Finish setting up this Mac in the app." : "Sign in to use your HN connection.")
                    .font(Theme.font(12)).foregroundStyle(Theme.muted)
            }
            Button { open(nil) } label: {
                HStack { Text("Open Secure Access Terminal"); Spacer(); Image(systemName: "arrow.up.right") }
            }
            .buttonStyle(MenuActionStyle())
            if let release = model.update {
                Button { open(.settings) } label: {
                    Label("Update \(release.version) available", systemImage: "arrow.down.circle")
                }.buttonStyle(.plain).font(Theme.font(11, .semibold)).foregroundStyle(Theme.accent)
            }
            if let error = model.error {
                Text(error).font(Theme.font(11)).foregroundStyle(Theme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var pinForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Connect to the VPN").font(Theme.font(16, .bold))
            Text("Enter your six-digit HN Group PIN.").font(Theme.font(11)).foregroundStyle(Theme.muted)
            PinEntry(compact: true)
            if let error = model.pinError { Text(error).font(Theme.font(11)).foregroundStyle(Theme.danger) }
            Button("Cancel") { model.cancelPin(); cancelSSH() }.buttonStyle(MenuActionStyle())
                .disabled(model.pinBusy || model.busy)
        }
    }
    private func cancelSSH() { sshPassword = ""; sshPrompt = false }
    private func submitSSH() {
        let password = sshPassword
        sshPassword = ""
        Task {
            await model.openSSH(password: password)
            if model.error == nil { sshPrompt = false }
        }
    }
    private func open(_ section: VPNModel.Section?) {
        cancelSSH()
        if let section = section { model.show(section) }
        NSApp.setActivationPolicy(.regular)
        openWindow(id: "main")
        NSApp.activate(ignoringOtherApps: true)
    }
}

/// Compact, themed menu actions without hover scaling or oversized glowing shadows.
struct MenuActionStyle: ButtonStyle {
    var primary = false
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(Theme.font(12, .semibold))
            .foregroundStyle(primary ? Theme.background : Theme.text)
            .frame(maxWidth: .infinity, minHeight: 38)
            .padding(.horizontal, 12)
            .background(RoundedRectangle(cornerRadius: 10).fill(primary ? Theme.accent : Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(primary ? Theme.accent : Theme.border))
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.45)
    }
}

struct MenuSSHForm: View {
    @EnvironmentObject var model: VPNModel
    @Binding var password: String
    var cancel: () -> Void
    var submit: () -> Void
    private enum Field: Hashable { case username, password }
    @FocusState private var focused: Field?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 9) {
                Button(action: cancel) { Image(systemName: "chevron.left").frame(width: 24, height: 24) }
                    .buttonStyle(.plain).foregroundStyle(Theme.accent).disabled(model.sshBusy)
                    .accessibilityLabel("Back to connection")
                VStack(alignment: .leading, spacing: 3) {
                    Text("SSH to the server").font(Theme.font(15, .bold))
                    Text("Your password is used once.").font(Theme.font(10)).foregroundStyle(Theme.muted)
                }
            }
            VStack(alignment: .leading, spacing: 5) {
                Text("Username").font(Theme.font(10, .semibold)).foregroundStyle(Theme.muted)
                TextField("Username", text: $model.sshUser).textFieldStyle(.plain)
                    .font(Theme.font(12)).padding(10)
                    .background(RoundedRectangle(cornerRadius: 9).fill(Theme.surface))
                    .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(focused == .username ? Theme.accent : Theme.border))
                    .focused($focused, equals: .username).accessibilityLabel("SSH username")
            }
            VStack(alignment: .leading, spacing: 5) {
                Text("Server password").font(Theme.font(10, .semibold)).foregroundStyle(Theme.muted)
                SecureField("Enter password", text: $password).textFieldStyle(.plain)
                    .font(Theme.font(12)).padding(10)
                    .background(RoundedRectangle(cornerRadius: 9).fill(Theme.surface))
                    .overlay(RoundedRectangle(cornerRadius: 9).strokeBorder(focused == .password ? Theme.accent : Theme.border))
                    .focused($focused, equals: .password).onSubmit { connect() }
                    .accessibilityLabel("SSH server password")
            }
            if let error = model.error {
                Text(error).font(Theme.font(10)).foregroundStyle(Theme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(action: connect) {
                HStack(spacing: 8) {
                    if model.sshBusy { ProgressView().controlSize(.small) }
                    Text(model.sshBusy ? "Opening Terminal…" : model.connected ? "Open SSH" : "Connect & open SSH")
                    Spacer()
                    Image(systemName: "arrow.right")
                }
            }
            .buttonStyle(MenuActionStyle(primary: true))
            .disabled(password.isEmpty || model.sshBusy || model.busy)
            .opacity(password.isEmpty || model.sshBusy || model.busy ? 0.5 : 1)
        }
        .onAppear { focused = .password }
    }
    private func connect() {
        guard !password.isEmpty, !model.sshBusy, !model.busy else { return }
        submit()
    }
}

/// MenuBarExtra's window must remain a menu-bar panel, not a draggable detached window.
struct MenuWindowAnchor: NSViewRepresentable {
    let enabled: Bool
    func makeNSView(context: Context) -> AnchorView { AnchorView(enabled: enabled) }
    func updateNSView(_ view: AnchorView, context: Context) { view.enabled = enabled }
    final class AnchorView: NSView {
        var enabled: Bool
        private var observer: NSObjectProtocol?
        init(enabled: Bool) { self.enabled = enabled; super.init(frame: .zero) }
        required init?(coder: NSCoder) { return nil }
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let observer = observer { NotificationCenter.default.removeObserver(observer) }
            guard let window = window, enabled, !window.styleMask.contains(.titled) else { return }
            observer = NotificationCenter.default.addObserver(forName: NSWindow.didBecomeKeyNotification, object: window, queue: .main) { [weak self] _ in self?.anchor() }
            DispatchQueue.main.async { [weak self] in self?.anchor() }
        }
        private func anchor() {
            guard enabled, let window = window, !window.styleMask.contains(.titled), let screen = window.screen else { return }
            window.isMovable = false
            window.isMovableByWindowBackground = false
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = true
            let bounds = screen.visibleFrame
            let x = max(bounds.minX + 8, min(window.frame.minX, bounds.maxX - window.frame.width - 8))
            window.setFrameTopLeftPoint(NSPoint(x: x, y: bounds.maxY - 6))
        }
        deinit { if let observer = observer { NotificationCenter.default.removeObserver(observer) } }
    }
}

// MARK: - PIN before connecting

/// Six masked boxes for the HN Group PIN. Typing the sixth digit checks it once; a wrong PIN shakes
/// the boxes and clears them. One hidden field takes the typing (and pasting) so the boxes stay simple.
struct PinEntry: View {
    @EnvironmentObject var model: VPNModel
    var compact = false
    @State private var code = ""
    @State private var shakes: CGFloat = 0
    @FocusState private var focused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            SecureField("", text: $code)
                .textFieldStyle(.plain)
                .focused($focused)
                .frame(width: 1, height: 1).opacity(0.01)
                .accessibilityLabel("Six-digit PIN")
                .onChange(of: code) { typed in
                    let digits = String(typed.filter { $0.isASCII && $0.isNumber }.prefix(6))
                    if digits != typed { code = digits; return }
                    if digits.count == 6 && !model.pinBusy { Task { await model.submitPin(digits) } }
                }
            HStack(spacing: compact ? 7 : 10) {
                ForEach(0..<6, id: \.self) { i in box(i) }
            }
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
        }
        .modifier(Shake(amount: shakes))
        .opacity(model.pinBusy ? 0.6 : 1)
        .onAppear { code = ""; focused = true; DispatchQueue.main.async { focused = true } }
        .onChange(of: model.pinError) { message in
            guard message != nil else { return }
            code = ""; focused = true
            if !reduceMotion { withAnimation(.linear(duration: 0.4)) { shakes += 1 } }
        }
    }

    private func box(_ i: Int) -> some View {
        let filled = i < code.count, current = focused && i == min(code.count, 5) && !model.pinBusy
        let size: CGFloat = compact ? 38 : 48
        return RoundedRectangle(cornerRadius: compact ? 10 : 12, style: .continuous)
            .fill(filled ? Theme.accentSoft : Theme.surface2)
            .overlay(RoundedRectangle(cornerRadius: compact ? 10 : 12, style: .continuous)
                .strokeBorder(current ? Theme.accent : Theme.border, lineWidth: current ? 2 : 1))
            .overlay(Circle().fill(Theme.accent).frame(width: compact ? 9 : 11, height: compact ? 9 : 11)
                .scaleEffect(filled ? 1 : 0.2).opacity(filled ? 1 : 0))
            .frame(width: size, height: size + (compact ? 4 : 8))
            .animation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.7), value: filled)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: current)
    }
}

/// A short side-to-side shake for a wrong PIN.
struct Shake: GeometryEffect {
    var amount: CGFloat
    var animatableData: CGFloat { get { amount } set { amount = newValue } }
    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 9 * sin(amount * .pi * 6), y: 0))
    }
}

/// The window's PIN card, centred over a lightly dimmed page.
struct PinSheet: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack {
            Color.black.opacity(0.32).ignoresSafeArea().onTapGesture { if !model.pinBusy { model.cancelPin() } }
                .transition(.opacity)
            VStack(spacing: 16) {
                if let user = model.user {
                    AvatarView(image: model.avatar, name: user.displayName, size: 56)
                        .overlay(Circle().strokeBorder(Theme.border, lineWidth: 1))
                }
                VStack(spacing: 5) {
                    Text(model.pinRequest?.ssh == nil ? "Enter your PIN to connect" : "Enter your PIN to connect and open SSH")
                        .font(Theme.font(19, .heavy)).multilineTextAlignment(.center)
                    Text("Your six-digit HN Group PIN")
                        .font(Theme.font(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
                PinEntry()
                ZStack {
                    if model.pinBusy { HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Checking…") }.foregroundStyle(Theme.muted) }
                    else if let message = model.pinError { Text(message).foregroundStyle(Theme.danger).multilineTextAlignment(.center) }
                    else { Text("You’re asked every time you connect.").foregroundStyle(Theme.muted) }
                }
                .font(Theme.font(12, .semibold)).frame(minHeight: 18)
                Button("Cancel") { model.cancelPin() }
                    .buttonStyle(HNButtonStyle(primary: false))
                    .keyboardShortcut(.cancelAction)
                    .disabled(model.pinBusy)
            }
            .padding(.horizontal, 30).padding(.vertical, 26)
            .frame(width: 400)
            .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(Theme.surface))
            .overlay(alignment: .top) { HNStripe().frame(height: 4).clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous)) }
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Theme.border))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.3), radius: 30, y: 16)
            .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.94)).combined(with: .offset(y: 10)))
        }
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
        // A wide sample picture, to check pictures fill the circle without stretching.
        m.avatar = NSImage(size: NSSize(width: 240, height: 160), flipped: false) { r in
            NSGradient(colors: [NSColor(Theme.teal), NSColor(Theme.purple)])?.draw(in: r, angle: 45)
            NSColor.white.withAlphaComponent(0.85).setFill(); NSBezierPath(ovalIn: NSRect(x: 85, y: 40, width: 70, height: 70)).fill()
            return true
        }
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

    static func askingForPin(_ m: VPNModel) -> VPNModel { m.pinRequest = VPNModel.PinRequest(); return m }

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
            ("pin", askingForPin(sample(connected: false)), CGSize(width: 1040, height: 760), false),
        ]
        for dark in [true, false] {
            shoot(DeviceGateView(gate: DeviceGate(preview: true, status: .unlinked, code: "ABCD-2345")).background(Theme.background).foregroundStyle(Theme.text), size: CGSize(width: 920, height: 640), dark: dark, to: folder.appendingPathComponent("device-not-authorised-\(dark ? "dark" : "light").png"))
            shoot(DeviceGateView(gate: DeviceGate(preview: true, status: .unlinked, code: "ABCD-2345"), compact: true).background(Theme.background).foregroundStyle(Theme.text), size: CGSize(width: 320, height: 420), dark: dark, to: folder.appendingPathComponent("menu-device-\(dark ? "dark" : "light").png"))
            for (name, model, size, _) in pages {
                shoot(MainView().environmentObject(model), size: size, dark: dark, to: folder.appendingPathComponent("\(name)-\(dark ? "dark" : "light").png"))
            }
            shoot(WorkspaceAccountPanel().environmentObject(sample()), size: CGSize(width: 320, height: 470), dark: dark, to: folder.appendingPathComponent("workspace-account-\(dark ? "dark" : "light").png"))
            let menuModel = sample()
            shoot(MenuView().environmentObject(menuModel), size: CGSize(width: MenuView.width, height: MenuView.height), dark: dark, to: folder.appendingPathComponent("menu-\(dark ? "dark" : "light").png"))
            shoot(MenuView(showSSH: true).environmentObject(sample()), size: CGSize(width: MenuView.width, height: MenuView.height), dark: dark, to: folder.appendingPathComponent("menu-ssh-\(dark ? "dark" : "light").png"))
            let pinMenu = askingForPin(sample(connected: false))
            shoot(MenuView().environmentObject(pinMenu), size: CGSize(width: MenuView.width, height: MenuView.height), dark: dark, to: folder.appendingPathComponent("menu-pin-\(dark ? "dark" : "light").png"))
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

/// A soft round glow (a radial gradient, so it looks the same everywhere, screenshots included).
struct Glow: View {
    let color: Color
    let size: CGFloat
    var body: some View {
        RadialGradient(colors: [color, color.opacity(0)], center: .center, startRadius: 0, endRadius: size / 2)
            .frame(width: size, height: size)
            .allowsHitTesting(false)
    }
}
