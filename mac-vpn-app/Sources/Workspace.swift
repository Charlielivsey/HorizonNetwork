import SwiftUI
import AppKit

// Mac-first presentation. Authentication, VPN, SSH and updater state remain in VPNModel.
enum AccessDesign {
    static let ink = Color(hex: 0x110D20)
    static let violet = Color(hex: 0x9871EF)
    static let fill = LinearGradient(colors: [Color(hex: 0x8655DB), Color(hex: 0x6331B9)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let line = Theme.border.opacity(0.65)
}

struct AccessSurface<Content: View>: View {
    var inset: CGFloat = 22
    @ViewBuilder var content: Content
    var body: some View {
        content.padding(inset).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(AccessDesign.line))
    }
}

struct AccessActionStyle: ButtonStyle {
    var primary = true
    var wide = false
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(Theme.font(12, .bold))
            .foregroundStyle(primary ? Color.white : Theme.text)
            .padding(.horizontal, 18).frame(maxWidth: wide ? .infinity : nil, minHeight: 42)
            .background(RoundedRectangle(cornerRadius: 12).fill(primary ? AnyShapeStyle(AccessDesign.fill) : AnyShapeStyle(Theme.surface2)))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(primary ? Color.white.opacity(0.16) : Theme.border.opacity(0.6)))
            .shadow(color: primary && enabled ? Theme.purple.opacity(0.18) : .clear, radius: 8, y: 3)
            .opacity(enabled ? (configuration.isPressed ? 0.78 : 1) : 0.45)
            .contentShape(RoundedRectangle(cornerRadius: 12))
            .scaleEffect(configuration.isPressed && enabled && !reduceMotion ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.09), value: configuration.isPressed)
    }
}

struct AccessToolbar: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        HStack(spacing: 16) {
            HNWordmark(height: 23)
            Rectangle().fill(Theme.border).frame(width: 1, height: 22)
            Text("Secure Access Terminal").font(Theme.font(12, .semibold)).foregroundStyle(Theme.muted)
            Spacer()
            if model.stage == .ready {
                HStack(spacing: 6) {
                    Circle().fill(model.connected ? Theme.success : Theme.muted).frame(width: 6, height: 6)
                    Text(model.connected ? "VPN connected" : "VPN disconnected").font(Theme.font(10, .semibold)).foregroundStyle(Theme.muted)
                }
                Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise").frame(width: 28, height: 28) }
                    .buttonStyle(.plain).foregroundStyle(Theme.muted).help("Refresh connection and account")
            }
        }
        .padding(.leading, 86).padding(.trailing, 22).frame(height: 44)
        .background(Theme.sidebar.opacity(0.6))
        .overlay(alignment: .bottom) { Rectangle().fill(AccessDesign.line).frame(height: 1) }
    }
}

struct AccessRail: View {
    @EnvironmentObject var model: VPNModel
    @State private var account = false
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("WORKSPACE").font(Theme.font(8, .bold)).tracking(1.2).foregroundStyle(Theme.muted)
                .padding(.horizontal, 12).padding(.bottom, 10)
            nav("power", "Connection", .connection)
            nav("terminal", "Terminal", .ssh)
            nav("person.crop.circle", "Profile", .profile)
            Spacer(minLength: 20)
            nav("slider.horizontal.3", "Settings", .settings)
            Rectangle().fill(Theme.border).frame(height: 1).padding(.horizontal, 8).padding(.vertical, 10)
            Button { account.toggle() } label: {
                HStack(spacing: 9) {
                    AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 28)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(model.user?.displayName ?? "Your account").font(Theme.font(10, .bold)).foregroundStyle(Theme.text).lineLimit(1)
                        Text("Your account").font(Theme.font(8)).foregroundStyle(Theme.muted)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold)).foregroundStyle(Theme.muted)
                }.padding(.horizontal, 8).frame(height: 44).contentShape(RoundedRectangle(cornerRadius: 11))
            }.buttonStyle(.plain).help("Your account")
                .popover(isPresented: $account, arrowEdge: .trailing) { WorkspaceAccountPanel(close: { account = false }).environmentObject(model) }
        }.padding(.horizontal, 10).padding(.top, 24).padding(.bottom, 12).frame(width: 168)
            .background(Theme.sidebar)
            .overlay(alignment: .trailing) { Rectangle().fill(Theme.border).frame(width: 1) }
    }
    private func nav(_ icon: String, _ label: String, _ section: VPNModel.Section) -> some View {
        Button { model.show(section) } label: {
            HStack(spacing: 11) {
                Image(systemName: icon).font(.system(size: 16, weight: .medium)).frame(width: 20)
                Text(label).font(Theme.font(11, .semibold))
                Spacer(minLength: 0)
            }.foregroundStyle(model.section == section ? Theme.accent : Theme.muted)
                .padding(.horizontal, 12).frame(height: 42)
                .background(RoundedRectangle(cornerRadius: 11).fill(model.section == section ? Theme.accentSoft : .clear))
                .overlay(RoundedRectangle(cornerRadius: 11).strokeBorder(model.section == section ? Theme.accent.opacity(0.2) : .clear))
                .contentShape(RoundedRectangle(cornerRadius: 11))
        }.buttonStyle(.plain).help(label).accessibilityLabel(label)
            .accessibilityIdentifier("access-nav-\(section)")
            .accessibilityAddTraits(model.section == section ? .isSelected : [])
    }
}

/// A purpose-drawn route illustration, rather than a giant power button or a dashboard of tiles.
struct AccessRouteArtwork: View {
    var connected: Bool
    var body: some View {
        GeometryReader { geometry in
            let w = geometry.size.width, h = geometry.size.height
            ZStack {
                RoundedRectangle(cornerRadius: 26).fill(LinearGradient(colors: [Color(hex: 0x221539), AccessDesign.ink, Color(hex: 0x152C36)], startPoint: .topLeading, endPoint: .bottomTrailing))
                Canvas(rendersAsynchronously: true) { context, size in
                    for column in 0..<24 {
                        for row in 0..<17 {
                            let rect = CGRect(x: CGFloat(column) * size.width / 23, y: CGFloat(row) * size.height / 16, width: 1.4, height: 1.4)
                            context.fill(Path(ellipseIn: rect), with: .color(.white.opacity(0.09)))
                        }
                    }
                    for i in 0..<5 {
                        let inset = CGFloat(i) * 17
                        let r = CGRect(x: size.width * 0.5 - 132 + inset, y: size.height * 0.41 - 80 + inset * 0.4, width: 264 - inset * 2, height: 160 - inset * 0.8)
                        context.stroke(Path(ellipseIn: r), with: .color(AccessDesign.violet.opacity(0.08 + Double(i) * 0.018)), lineWidth: 1)
                    }
                    var path = Path()
                    path.move(to: CGPoint(x: size.width * 0.17, y: size.height * 0.76))
                    path.addCurve(to: CGPoint(x: size.width * 0.83, y: size.height * 0.76), control1: CGPoint(x: size.width * 0.27, y: size.height * 0.1), control2: CGPoint(x: size.width * 0.73, y: size.height * 0.1))
                    context.stroke(path, with: .color(AccessDesign.violet.opacity(0.16)), lineWidth: 9)
                    context.stroke(path, with: .linearGradient(Gradient(colors: [AccessDesign.violet, Color(hex: 0x88DFC0)]), startPoint: CGPoint(x: 0, y: 0), endPoint: CGPoint(x: size.width, y: size.height)), style: StrokeStyle(lineWidth: 1.5, dash: connected ? [] : [5, 6]))
                }.padding(15)
                VStack(spacing: 9) {
                    ZStack(alignment: .bottomTrailing) {
                        RoundedRectangle(cornerRadius: 22).fill(LinearGradient(colors: [Color(hex: 0x58437F), Color(hex: 0x29203F)], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(.white.opacity(0.18)))
                        Image(systemName: "lock.shield").font(.system(size: 32, weight: .light)).foregroundStyle(.white.opacity(0.94))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        Circle().fill(connected ? Color(hex: 0x88DFC0) : Color(hex: 0xBAAACF)).frame(width: 10, height: 10)
                            .overlay(Circle().stroke(AccessDesign.ink, lineWidth: 3)).offset(x: 3, y: 3)
                    }.frame(width: 76, height: 76).shadow(color: .black.opacity(0.2), radius: 18, y: 8)
                    Text(connected ? "PRIVATE CONNECTION" : "YOUR PRIVATE NETWORK")
                        .font(Theme.font(7, .bold)).tracking(1.8).foregroundStyle(.white.opacity(0.48))
                }.position(x: w / 2, y: h * 0.40)
                HStack(alignment: .top) {
                    endpoint("laptopcomputer", "This Mac", "Your device")
                    Spacer()
                    endpoint("server.rack", "United Kingdom", "HN Group")
                }.padding(.horizontal, 24).position(x: w / 2, y: h * 0.84)
            }.clipShape(RoundedRectangle(cornerRadius: 26))
                .overlay(RoundedRectangle(cornerRadius: 26).strokeBorder(.white.opacity(0.07)))
        }.transaction { $0.animation = nil }.accessibilityHidden(true)
    }
    private func endpoint(_ icon: String, _ title: String, _ subtitle: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 16, weight: .medium)).foregroundStyle(Color(hex: 0xD3C3F5))
                .frame(width: 34, height: 34).background(RoundedRectangle(cornerRadius: 11).fill(Color(hex: 0x29213C)))
                .overlay(RoundedRectangle(cornerRadius: 11).strokeBorder(.white.opacity(0.1)))
            Text(title).font(Theme.font(10, .bold)).foregroundStyle(.white.opacity(0.85))
            Text(subtitle).font(Theme.font(8)).foregroundStyle(.white.opacity(0.4))
        }.frame(width: 104)
    }
}

struct AccessConnection: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Your connection").font(Theme.font(23, .bold)).tracking(-0.6)
                    Text("Private access to HN Group.").font(Theme.font(12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Label("United Kingdom", systemImage: "globe.europe.africa").font(Theme.font(11, .semibold)).foregroundStyle(Theme.muted)
            }
            if !model.isSetUp || !model.wireGuardInstalled { AccessSetup() }
            else {
                HStack(spacing: 24) {
                    AccessRouteArtwork(connected: model.connected).frame(maxWidth: .infinity).frame(height: 304)
                    control.frame(width: 272)
                }
                HStack(spacing: 0) {
                    detail("laptopcomputer", "THIS MAC", model.deviceName ?? "This device")
                    Rectangle().fill(Theme.border).frame(width: 1, height: 32).padding(.horizontal, 18)
                    detail("server.rack", "PRIVATE SERVER", VPNModel.serverAddress)
                    Rectangle().fill(Theme.border).frame(width: 1, height: 32).padding(.horizontal, 18)
                    detail("terminal", "SSH ACCESS", !model.connected ? "VPN required" : model.serverReachable == true ? "Ready to connect" : model.serverReachable == false ? "Not responding" : "Checking…")
                }.padding(.horizontal, 18).padding(.vertical, 18)
                    .background(RoundedRectangle(cornerRadius: 16).fill(Theme.surface.opacity(0.65)))
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(AccessDesign.line))
                HStack(spacing: 6) {
                    Image(systemName: "menubar.rectangle")
                    Text("Close the window. Your connection stays with you in the menu bar.")
                }.font(Theme.font(10)).foregroundStyle(Theme.muted).padding(.horizontal, 2)
            }
        }
    }
    private var control: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack(spacing: 6) {
                Circle().fill(model.connected ? Theme.success : Theme.muted).frame(width: 6, height: 6)
                Text(model.busy ? "UPDATING" : model.connected ? "CONNECTED" : "DISCONNECTED").font(Theme.font(8, .bold)).tracking(1.4).foregroundStyle(model.connected ? Theme.success : Theme.muted)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(model.connected ? "You’re connected." : "Ready when you are.").font(Theme.font(22, .bold)).tracking(-0.5)
                Text(model.connected ? "Your Mac is connected to the HN Group VPN." : "Connect this Mac to HN Group’s private network.")
                    .font(Theme.font(12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(2)
            }
            VStack(spacing: 12) {
                metric("Protocol", "WireGuard")
                HStack {
                    Text("Session").foregroundStyle(Theme.muted)
                    Spacer()
                    if model.connected, let since = model.connectedSince {
                        TimelineView(.periodic(from: .now, by: 1)) { t in Text(duration(t.date.timeIntervalSince(since))).monospacedDigit() }
                    } else { Text("Not connected") }
                }.font(Theme.font(11, .medium))
            }.padding(.vertical, 4)
            Button { Task { await model.toggle() } } label: {
                HStack(spacing: 8) { if model.busy { ProgressView().controlSize(.small).tint(.white) }; Image(systemName: "power"); Text(model.busy ? "Please wait…" : model.connected ? "Disconnect" : "Connect VPN"); Spacer(); Image(systemName: "arrow.right") }
            }.buttonStyle(AccessActionStyle(wide: true)).disabled(model.busy || model.sshBusy || model.pinRequest != nil)
            Button { model.show(.ssh) } label: {
                HStack(spacing: 8) { Image(systemName: "terminal"); Text("Open server terminal"); Spacer(); Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold)) }.frame(minHeight: 36).contentShape(Rectangle())
            }.buttonStyle(.plain).font(Theme.font(11, .semibold)).foregroundStyle(Theme.muted).padding(.horizontal, 2)
        }.padding(.vertical, 12)
    }
    private func metric(_ title: String, _ value: String) -> some View {
        HStack { Text(title).foregroundStyle(Theme.muted); Spacer(); Text(value) }.font(Theme.font(11, .medium))
    }
    private func detail(_ icon: String, _ label: String, _ value: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 16)).foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 5) {
                Text(label).font(Theme.font(7, .bold)).tracking(1).foregroundStyle(Theme.muted)
                Text(value).font(Theme.font(10, .semibold)).lineLimit(1).truncationMode(.middle)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func duration(_ t: TimeInterval) -> String {
        let s = max(0, Int(t)); return String(format: "%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }
}

struct AccessSetup: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        HStack(spacing: 26) {
            AccessRouteArtwork(connected: false).frame(maxWidth: .infinity).frame(height: 340)
            VStack(alignment: .leading, spacing: 22) {
                Text("Make yourself\nat home.").font(Theme.font(26, .bold)).tracking(-0.7)
                Text("Two quick steps to get your Mac connected.").font(Theme.font(12)).foregroundStyle(Theme.muted)
                setupStep("1", "Install WireGuard", model.wireGuardInstalled ? "Installed and ready" : "The tools behind your connection", done: model.wireGuardInstalled)
                if !model.wireGuardInstalled {
                    Button("Install tools") { model.installWireGuard() }.buttonStyle(AccessActionStyle(wide: true))
                }
                setupStep("2", "Register this Mac", "macOS will ask for your Mac password.", done: false)
                Button { Task { await model.setUp() } } label: {
                    HStack { if model.busy { ProgressView().controlSize(.small) }; Text(model.busy ? "Setting up…" : "Set up this Mac"); Spacer(); Image(systemName: "arrow.right") }
                }.buttonStyle(AccessActionStyle(wide: true)).disabled(model.busy || !model.wireGuardInstalled)
            }.frame(width: 280)
        }
    }
    private func setupStep(_ number: String, _ title: String, _ text: String, done: Bool) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Text(done ? "✓" : number).font(Theme.font(11, .bold)).foregroundStyle(done ? Theme.success : Theme.accent)
                .frame(width: 26, height: 26).background(Circle().fill(Theme.accentSoft))
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(Theme.font(12, .bold)); Text(text).font(Theme.font(10)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct AccessSSH: View {
    @EnvironmentObject var model: VPNModel
    @State private var password = ""
    @FocusState private var focused: Field?
    private enum Field: Hashable { case username, password }
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Server terminal").font(Theme.font(23, .bold)).tracking(-0.6)
                    Text("Your server. One secure session away.").font(Theme.font(12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Label(model.connected ? (model.serverReachable == true ? "Server available" : model.serverReachable == false ? "Server not responding" : "Checking server…") : "VPN required", systemImage: "circle.fill")
                    .font(Theme.font(10, .semibold)).foregroundStyle(model.connected && model.serverReachable == true ? Theme.success : Theme.muted)
            }
            HStack(alignment: .top, spacing: 26) {
                terminal.frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 18) {
                    Text("Open a session").font(Theme.font(19, .bold)).tracking(-0.4)
                    Text("Sign in with your server credentials.").font(Theme.font(11)).foregroundStyle(Theme.muted)
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Username").font(Theme.font(11, .semibold)).foregroundStyle(Theme.muted)
                        TextField("root", text: $model.sshUser).textFieldStyle(.plain).disableAutocorrection(true)
                            .focused($focused, equals: .username).onSubmit { focused = .password }
                            .modifier(AccessField(active: focused == .username))
                    }
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Server password").font(Theme.font(11, .semibold)).foregroundStyle(Theme.muted)
                        SecureField("Enter password", text: $password).textFieldStyle(.plain)
                            .focused($focused, equals: .password).onSubmit(open)
                            .modifier(AccessField(active: focused == .password))
                    }
                    Button(action: open) {
                        HStack(spacing: 8) { if model.sshBusy { ProgressView().controlSize(.small).tint(.white) }; Text(model.sshBusy ? "Opening…" : "Launch Terminal"); Spacer(); Image(systemName: "arrow.up.right") }
                    }.buttonStyle(AccessActionStyle(wide: true)).keyboardShortcut(.defaultAction)
                        .disabled(password.isEmpty || model.sshBusy || model.busy || !model.isSetUp)
                    if !model.isSetUp {
                        Button("Set up this Mac first") { model.show(.connection) }.buttonStyle(.plain).foregroundStyle(Theme.accent)
                    } else {
                        Text(model.connected ? "Opens a separate macOS Terminal window." : "Your HN Group PIN will be requested before the VPN connects.")
                            .font(Theme.font(10)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }.frame(width: 272).padding(.top, 4)
            }
            HStack(spacing: 20) {
                Label("Password used once", systemImage: "key.slash")
                Label("Server key remembered", systemImage: "checkmark.shield")
                Spacer()
                Text("SSH · \(VPNModel.serverAddress)").font(.system(size: 10, design: .monospaced))
            }.font(Theme.font(10)).foregroundStyle(Theme.muted).padding(.top, 4)
        }.onAppear { focused = .password }.onDisappear { password = "" }
    }
    private var terminal: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                ForEach([0xFF6B69, 0xEAC65A, 0x6FC78B], id: \.self) { c in Circle().fill(Color(hex: UInt32(c)).opacity(0.7)).frame(width: 7, height: 7) }
                Spacer(); Text("HN GROUP / SECURE SHELL").font(Theme.font(7, .bold)).tracking(1.2).foregroundStyle(.white.opacity(0.4))
            }.padding(18)
            Rectangle().fill(.white.opacity(0.07)).frame(height: 1)
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "terminal").font(.system(size: 31, weight: .ultraLight)).foregroundStyle(Color(hex: 0xC2A4F9)).padding(.top, 12)
                Text("A direct line\nto your server.").font(Theme.font(25, .semibold)).tracking(-0.7).foregroundStyle(.white.opacity(0.95))
                Text("PRIVATE NETWORK · UNITED KINGDOM").font(Theme.font(7, .bold)).tracking(1.4).foregroundStyle(.white.opacity(0.35))
                HStack(spacing: 5) {
                    Text("›").foregroundStyle(Color(hex: 0x8EDAC0))
                    Text("ssh").foregroundStyle(.white.opacity(0.6))
                    Text("\(model.sshUser.isEmpty ? "root" : String(model.sshUser.prefix(24)))@\(VPNModel.serverAddress)").foregroundStyle(Color(hex: 0xCCB3FB)).lineLimit(1).minimumScaleFactor(0.7)
                }.font(.system(size: 11, weight: .medium, design: .monospaced)).padding(.top, 6)
                Spacer(minLength: 0)
            }.padding(.horizontal, 24).padding(.bottom, 24)
        }.frame(height: 323)
            .background(LinearGradient(colors: [Color(hex: 0x221635), AccessDesign.ink, Color(hex: 0x17212D)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(.white.opacity(0.1)))
    }
    private func open() {
        guard !password.isEmpty && !model.sshBusy && !model.busy && model.isSetUp else { return }
        let value = password; password = ""
        Task { await model.openSSH(password: value) }
    }
}

struct AccessField: ViewModifier {
    let active: Bool
    func body(content: Content) -> some View {
        content.font(Theme.font(12)).padding(.horizontal, 13).frame(height: 42)
            .background(RoundedRectangle(cornerRadius: 11).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 11).strokeBorder(active ? Theme.accent.opacity(0.85) : Theme.border))
    }
}

struct AccessProfile: View {
    enum Panel: String, CaseIterable { case devices = "Devices", sessions = "Sign-ins", activity = "Activity" }
    @EnvironmentObject var model: VPNModel
    @State private var panel: Panel
    init(initialPanel: Panel = .devices) { _panel = State(initialValue: initialPanel) }
    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            HStack(spacing: 16) {
                AvatarView(image: model.avatar, name: model.user?.displayName ?? "", size: 60)
                    .overlay(Circle().strokeBorder(Theme.border))
                VStack(alignment: .leading, spacing: 5) {
                    Text(model.user?.displayName ?? "Your account").font(Theme.font(24, .bold)).tracking(-0.6)
                    Text(model.user?.email ?? "").font(Theme.font(12)).foregroundStyle(Theme.muted).lineLimit(1).truncationMode(.middle)
                    Text(model.user?.admin == true ? "VPN administrator" : "HN Group staff").font(Theme.font(9, .semibold)).foregroundStyle(Theme.accent)
                }
                Spacer()
                Button { NSWorkspace.shared.open(URL(string: "https://accounts.hngroup.org.uk")!) } label: { Label("HN Account", systemImage: "arrow.up.right") }
                    .buttonStyle(AccessActionStyle(primary: false))
            }
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 22) {
                    ForEach(Panel.allCases, id: \.self) { item in
                        Button { panel = item } label: {
                            Text(item.rawValue).font(Theme.font(12, .semibold)).foregroundStyle(panel == item ? Theme.accent : Theme.muted)
                                .padding(.horizontal, 5).padding(.vertical, 16).contentShape(Rectangle()).overlay(alignment: .bottom) { Capsule().fill(panel == item ? Theme.accent : .clear).frame(height: 2) }
                        }.buttonStyle(.plain).accessibilityAddTraits(panel == item ? .isSelected : [])
                    }
                    Spacer()
                    if let profile = model.profile {
                        Text("\(profile.devices.count) / \(profile.limit) devices").font(Theme.font(10)).foregroundStyle(Theme.muted)
                    }
                }.padding(.horizontal, 22)
                Rectangle().fill(AccessDesign.line).frame(height: 1)
                VStack(alignment: .leading, spacing: 0) {
                    if let profile = model.profile {
                        switch panel {
                        case .devices:
                            if profile.devices.isEmpty { empty("No devices registered yet.") }
                            ForEach(profile.devices) { device in
                                HStack(spacing: 14) {
                                    rowIcon(device.name.range(of: "mac|book|laptop", options: [.regularExpression, .caseInsensitive]) != nil ? "laptopcomputer" : "iphone")
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(device.name).font(Theme.font(12, .bold))
                                        Text(device.address).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                                    }
                                    Spacer()
                                    Text(device.connected == true ? "Connected" : When.ago(device.lastHandshake)).font(Theme.font(10, .medium)).foregroundStyle(device.connected == true ? Theme.success : Theme.muted)
                                }.padding(.vertical, 17)
                                Rectangle().fill(AccessDesign.line).frame(height: 1)
                            }
                            Button { NSWorkspace.shared.open(API.base) } label: { Label("Manage devices on the web", systemImage: "arrow.up.right") }
                                .buttonStyle(.plain).foregroundStyle(Theme.accent).font(Theme.font(11, .semibold)).padding(.top, 20)
                        case .sessions:
                            if profile.sessions.isEmpty { empty("No active sign-ins.") }
                            ForEach(profile.sessions) { session in
                                HStack(spacing: 14) {
                                    rowIcon(session.kind == "app" ? "laptopcomputer" : "globe")
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(session.kind == "app" ? "Secure Access Terminal" : "VPN website").font(Theme.font(12, .bold))
                                        Text("Last used \(When.short(session.lastUsedAt))").font(Theme.font(10)).foregroundStyle(Theme.muted)
                                    }
                                    Spacer()
                                    if session.current { Text("This Mac").font(Theme.font(10, .semibold)).foregroundStyle(Theme.success) }
                                    else { Button("Sign out") { Task { await model.endSignIn(session) } }.buttonStyle(AccessActionStyle(primary: false)) }
                                }.padding(.vertical, 17)
                                Rectangle().fill(AccessDesign.line).frame(height: 1)
                            }
                        case .activity:
                            if profile.activity.isEmpty { empty("No recent activity.") }
                            ForEach(Array(profile.activity.enumerated()), id: \.offset) { _, event in
                                HStack(spacing: 14) {
                                    rowIcon("clock.arrow.circlepath")
                                    Text(activityLabel(event.action)).font(Theme.font(12, .medium))
                                    Spacer()
                                    Text(When.short(event.at)).font(Theme.font(10)).foregroundStyle(Theme.muted)
                                }.padding(.vertical, 15)
                                Rectangle().fill(AccessDesign.line).frame(height: 1)
                            }
                        }
                    } else {
                        ProgressView().controlSize(.small).padding(30)
                    }
                }.padding(.horizontal, 22).padding(.bottom, 22).frame(minHeight: 245, alignment: .topLeading)
            }.background(RoundedRectangle(cornerRadius: 20).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(AccessDesign.line))
            Text("Your name and photo are managed through your HN account.").font(Theme.font(10)).foregroundStyle(Theme.muted)
        }
    }
    private func rowIcon(_ name: String) -> some View {
        Image(systemName: name).font(.system(size: 17)).foregroundStyle(Theme.accent).frame(width: 38, height: 38)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface2))
    }
    private func empty(_ text: String) -> some View { Text(text).font(Theme.font(12)).foregroundStyle(Theme.muted).padding(.vertical, 30) }
    private func activityLabel(_ action: String) -> String {
        ["sign-in.web": "Signed in to the VPN website", "sign-in.app": "Signed in to Secure Access", "sign-out.other": "Ended another sign-in", "device.add": "Registered a device", "device.remove": "Removed a device", "mac-app.publish": "Published an app update"][action] ?? action
    }
}

struct AccessSettings: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Make it yours.").font(Theme.font(23, .bold)).tracking(-0.6)
                Text("A few preferences. Everything in one place.").font(Theme.font(12)).foregroundStyle(Theme.muted)
            }
            VStack(spacing: 0) {
                HStack(spacing: 15) {
                    AppMark(size: 44)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("HN Secure Access Terminal").font(Theme.font(13, .bold))
                        Text(AppInfo.label).font(Theme.font(11)).foregroundStyle(Theme.muted)
                        updateText.font(Theme.font(10)).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 14)
                    if model.update != nil {
                        Button("Install update") { Task { await model.installUpdate() } }.buttonStyle(AccessActionStyle())
                            .disabled(model.updateState == .downloading || model.updateState == .installing)
                    } else {
                        Button("Check for updates") { Task { await model.checkForUpdate() } }.buttonStyle(AccessActionStyle(primary: false))
                            .disabled(model.updateState == .checking)
                    }
                }.padding(22)
                separator
                settingsRow("power", "Launch at login", "Keep Secure Access ready in your menu bar.") {
                    Toggle("Launch at login", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
                        .labelsHidden().toggleStyle(.switch).tint(Theme.purple)
                }
                separator
                settingsRow("menubar.rectangle", "Keep the connection running", "Closing the window hides the Dock icon. The VPN stays on.") {
                    Text("Always on").font(Theme.font(10, .semibold)).foregroundStyle(Theme.muted)
                }
                separator
                settingsRow("person.crop.circle", "Your account & devices", "Manage access to your HN network.") {
                    Button { NSWorkspace.shared.open(API.base) } label: { Image(systemName: "arrow.up.right").frame(width: 36, height: 36).contentShape(Rectangle()) }
                        .buttonStyle(.plain).foregroundStyle(Theme.accent).help("Manage account and devices on the web")
                }
            }.background(RoundedRectangle(cornerRadius: 20).fill(Theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(AccessDesign.line))
            HStack {
                Text("Signing out disconnects and unregisters this Mac.").font(Theme.font(10)).foregroundStyle(Theme.muted)
                Spacer()
                Button("Sign out") { Task { await model.signOut() } }.buttonStyle(.plain).foregroundStyle(Theme.danger).font(Theme.font(11, .semibold))
            }.padding(.horizontal, 4)
        }
    }
    private var separator: some View { Rectangle().fill(AccessDesign.line).frame(height: 1).padding(.horizontal, 22) }
    private func settingsRow<T: View>(_ icon: String, _ title: String, _ text: String, @ViewBuilder action: () -> T) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 17)).foregroundStyle(Theme.accent).frame(width: 32)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(Theme.font(12, .semibold))
                Text(text).font(Theme.font(10)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 16)
            action()
        }.padding(.horizontal, 22).padding(.vertical, 20)
    }
    @ViewBuilder private var updateText: some View {
        switch model.updateState {
        case .checking: Text("Checking for updates…").foregroundStyle(Theme.muted)
        case .upToDate: Text("You’re up to date").foregroundStyle(Theme.success)
        case .downloading: Text("Downloading update…").foregroundStyle(Theme.accent)
        case .installing: Text("Installing — the app will reopen").foregroundStyle(Theme.accent)
        case .failed(let message): Text(message).foregroundStyle(Theme.danger)
        case .idle:
            if let release = model.update { Text("Version \(release.version) is ready").foregroundStyle(Theme.accent) }
        }
    }
}

struct AccessWelcome: View {
    @EnvironmentObject var model: VPNModel
    var body: some View {
        VStack(spacing: 0) {
            if model.preview { AccessToolbar() }
            HStack(spacing: 48) {
                AccessRouteArtwork(connected: false).frame(maxWidth: .infinity).frame(height: 370)
                VStack(alignment: .leading, spacing: 20) {
                    Text(model.stage == .waiting ? "See you in\na moment." : "Your network,\nwithin reach.")
                        .font(Theme.font(31, .bold)).tracking(-1)
                    Text(model.stage == .waiting ? "Finish signing in with HN Group Auth in your browser, then return here." : "One place for your private connection and HN Group server access.")
                        .font(Theme.font(13)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).lineSpacing(2)
                    if model.stage == .waiting {
                        HStack(spacing: 8) { ProgressView().controlSize(.small); Text("Waiting for your browser…").font(Theme.font(11)).foregroundStyle(Theme.muted) }
                        Button("Reopen sign-in page") { model.signIn() }.buttonStyle(AccessActionStyle(wide: true))
                        Button("Cancel") { model.cancelSignIn() }.buttonStyle(.plain).font(Theme.font(11)).foregroundStyle(Theme.muted)
                    } else {
                        VStack(alignment: .leading, spacing: 11) {
                            Label("WireGuard connection", systemImage: "lock.shield")
                            Label("Server terminal access", systemImage: "terminal")
                        }.font(Theme.font(11, .medium)).foregroundStyle(Theme.muted).padding(.vertical, 6)
                        Button { model.signIn() } label: { HStack { Text("Sign in with HN Group Auth"); Spacer(); Image(systemName: "arrow.up.right") } }
                            .buttonStyle(AccessActionStyle(wide: true)).keyboardShortcut(.defaultAction)
                    }
                    if let error = model.error { Text(error).font(Theme.font(11)).foregroundStyle(Theme.danger) }
                    Text(AppInfo.label).font(Theme.font(9)).foregroundStyle(Theme.muted.opacity(0.7))
                }.frame(width: 300)
            }.padding(42).frame(maxWidth: 1020).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
