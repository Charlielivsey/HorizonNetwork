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
        .defaultSize(width: 980, height: 680)
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
                case .signIn, .waiting: AccessWelcome().transition(.opacity)
                case .ready: SignedInView().transition(.opacity)
                } }
            }
            .animation(.easeInOut(duration: 0.3), value: model.stage)
            .animation(.easeInOut(duration: 0.3), value: gate.allowed)
            if gate.allowed, model.stage == .ready, model.pinRequest != nil { PinSheet() }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.34, dampingFraction: 0.86), value: model.pinRequest)
        .frame(minWidth: 880, minHeight: 620)
        .background(Theme.background)
        .background(MainWindowRegistration())
        .font(Theme.font(14))
        .foregroundStyle(Theme.text)
        .ignoresSafeArea(.container, edges: .top)
    }
}

struct SignedInView: View {
    @EnvironmentObject var model: VPNModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        VStack(spacing: 0) {
            AccessToolbar()
            HStack(spacing: 0) {
                AccessRail()
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        notices
                        Group {
                            switch model.section {
                            case .connection: AccessConnection()
                            case .ssh: AccessSSH()
                            case .profile: AccessProfile()
                            case .settings: AccessSettings()
                            }
                        }.id(model.section).transition(.opacity)
                    }
                    .padding(.horizontal, 30).padding(.top, 28).padding(.bottom, 24)
                    .frame(maxWidth: 1040, alignment: .leading).frame(maxWidth: .infinity)
                }
            }
        }.animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: model.section)
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

struct WorkspaceAccountPanel: View {
    @EnvironmentObject var model: VPNModel
    var close: () -> Void = {}
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 11) {
                AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 36)
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.user?.displayName ?? "Your account").font(Theme.font(13, .bold))
                    Text(model.user?.email ?? "").font(Theme.font(10)).foregroundStyle(Theme.muted).lineLimit(1).truncationMode(.middle)
                }
                Spacer(minLength: 0)
            }.padding(10).padding(.bottom, 6)
            Rectangle().fill(Theme.border).frame(height: 1).padding(.horizontal, 10).padding(.bottom, 6)
            WorkspaceAccountAction(icon: "person.crop.circle", title: "Profile") { close(); model.show(.profile) }
            WorkspaceAccountAction(icon: "slider.horizontal.3", title: "Settings") { close(); model.show(.settings) }
            WorkspaceAccountAction(icon: "person", title: "HN Account", external: true) {
                close(); NSWorkspace.shared.open(URL(string: "https://accounts.hngroup.org.uk")!)
            }
            WorkspaceAccountAction(icon: "rectangle.portrait.and.arrow.right", title: "Sign out") {
                close(); Task { await model.signOut() }
            }.disabled(model.busy)
            Rectangle().fill(Theme.border).frame(height: 1).padding(.horizontal, 10).padding(.vertical, 6)
            WorkspaceAccountAction(icon: "square.grid.2x2", title: "All HN sites", external: true, small: true) {
                close(); NSWorkspace.shared.open(URL(string: "https://sites.hngroup.org.uk")!)
            }
        }.padding(8).frame(width: 288).background(Theme.surface)
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
            .padding(10).frame(minHeight: small ? 32 : 36)
            .background(RoundedRectangle(cornerRadius: 9).fill(hover ? Theme.surface2 : Color.clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain).onHover { hover = $0 }
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
    static let width: CGFloat = 360
    static let height: CGFloat = 408
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
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 10) {
                HNWordmark(height: 24).environment(\.colorScheme, .dark)
                Spacer()
                Text("SECURE ACCESS").font(Theme.font(7, .bold)).tracking(1.5).foregroundStyle(.white.opacity(0.42))
                if let user = model.user, model.stage == .ready {
                    AvatarView(image: model.avatar, name: user.displayName, size: 27)
                }
            }
            if !sshPrompt && model.pinRequest == nil {
                HStack(spacing: 13) {
                    Button { Task { await model.toggle() } } label: {
                        ZStack {
                            RoundedRectangle(cornerRadius: 16).fill(model.connected ? AnyShapeStyle(AccessDesign.fill) : AnyShapeStyle(Color.white.opacity(0.08)))
                            RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.14))
                            if model.busy { ProgressView().controlSize(.small).tint(.white) }
                            else { Image(systemName: "power").font(.system(size: 22, weight: .medium)).foregroundStyle(.white) }
                        }.frame(width: 52, height: 52)
                    }.buttonStyle(.plain)
                        .disabled(model.busy || model.sshBusy || model.pinRequest != nil || model.stage != .ready || !model.isSetUp)
                        .accessibilityLabel(model.connected ? "Disconnect VPN" : "Connect VPN")
                    VStack(alignment: .leading, spacing: 5) {
                        Text(model.busy ? "Please wait…" : model.connected ? "Connected." : "Ready to connect.")
                            .font(Theme.font(21, .bold)).tracking(-0.5).foregroundStyle(.white)
                        HStack(spacing: 5) {
                            Circle().fill(model.connected ? Color(hex: 0x88DFC0) : .white.opacity(0.35)).frame(width: 5, height: 5)
                            Text(model.connected ? "United Kingdom · HN Group" : "Your private HN connection")
                                .font(Theme.font(10)).foregroundStyle(.white.opacity(0.55))
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }.padding(.horizontal, 20).padding(.vertical, 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [Color(hex: 0x2B1946), AccessDesign.ink, Color(hex: 0x172A32)], startPoint: .topLeading, endPoint: .bottomTrailing))
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
            .foregroundStyle(primary ? Color.white : Theme.text)
            .frame(maxWidth: .infinity, minHeight: 38)
            .padding(.horizontal, 12)
            .background(RoundedRectangle(cornerRadius: 10).fill(primary ? AnyShapeStyle(AccessDesign.fill) : AnyShapeStyle(Theme.surface)))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(primary ? Color.white.opacity(0.14) : Theme.border))
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
                            sessions: [SignInEntry(id: "1", kind: "app", createdAt: "2026-10-19T09:12:00Z", lastUsedAt: "2026-10-19T16:40:00Z", appVersion: AppInfo.version, current: true),
                                       SignInEntry(id: "2", kind: "web", createdAt: "2026-10-18T14:02:00Z", lastUsedAt: "2026-10-18T14:30:00Z", appVersion: nil, current: false)],
                            activity: [Activity(at: "2026-10-19T09:12:00Z", action: "sign-in.app", detail: nil), Activity(at: "2026-10-18T14:02:00Z", action: "device.add", detail: nil), Activity(at: "2026-10-18T13:58:00Z", action: "sign-in.web", detail: nil)])
        return m
    }

    static func askingForPin(_ m: VPNModel) -> VPNModel { m.pinRequest = VPNModel.PinRequest(); return m }

    static func render(to folder: URL) {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let pages: [(String, VPNModel, CGSize, Bool)] = [
            ("welcome", sample(stage: .signIn, setUp: false, connected: false), CGSize(width: 980, height: 660), false),
            ("connected", sample(), CGSize(width: 980, height: 680), false),
            ("connected-small", sample(), CGSize(width: 880, height: 620), false),
            ("ssh-small", sample(section: .ssh), CGSize(width: 880, height: 620), false),
            ("disconnected", sample(connected: false), CGSize(width: 980, height: 680), false),
            ("setup", sample(setUp: false, connected: false), CGSize(width: 980, height: 680), false),
            ("ssh", sample(section: .ssh), CGSize(width: 980, height: 680), false),
            ("profile", sample(section: .profile), CGSize(width: 980, height: 680), false),
            ("settings", sample(section: .settings), CGSize(width: 980, height: 680), false),
            ("pin", askingForPin(sample(connected: false)), CGSize(width: 980, height: 680), false),
        ]
        for dark in [true, false] {
            shoot(DeviceGateView(gate: DeviceGate(preview: true, status: .unlinked, code: "ABCD-2345")).background(Theme.background).foregroundStyle(Theme.text), size: CGSize(width: 920, height: 640), dark: dark, to: folder.appendingPathComponent("device-not-authorised-\(dark ? "dark" : "light").png"))
            shoot(DeviceGateView(gate: DeviceGate(preview: true, status: .unlinked, code: "ABCD-2345"), compact: true).background(Theme.background).foregroundStyle(Theme.text), size: CGSize(width: 320, height: 420), dark: dark, to: folder.appendingPathComponent("menu-device-\(dark ? "dark" : "light").png"))
            for (name, model, size, _) in pages {
                shoot(MainView().environmentObject(model), size: size, dark: dark, to: folder.appendingPathComponent("\(name)-\(dark ? "dark" : "light").png"))
            }
            shoot(AccessProfile(initialPanel: .sessions).environmentObject(sample()).padding(28).background(Theme.background).foregroundStyle(Theme.text), size: CGSize(width: 820, height: 520), dark: dark, to: folder.appendingPathComponent("profile-sessions-\(dark ? "dark" : "light").png"))
            shoot(AccessProfile(initialPanel: .activity).environmentObject(sample()).padding(28).background(Theme.background).foregroundStyle(Theme.text), size: CGSize(width: 820, height: 520), dark: dark, to: folder.appendingPathComponent("profile-activity-\(dark ? "dark" : "light").png"))
            shoot(WorkspaceAccountPanel().environmentObject(sample()), size: CGSize(width: 288, height: 340), dark: dark, to: folder.appendingPathComponent("workspace-account-\(dark ? "dark" : "light").png"))
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
