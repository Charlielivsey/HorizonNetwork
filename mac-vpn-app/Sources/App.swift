import SwiftUI
import AppKit

/// HN Group VPN: a menu bar app for HN Group staff.
@main
struct HNGroupVPNApp: App {
    @StateObject private var model = VPNModel()

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
                case .pin: PinView()
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
            Text("Use your HN Group staff account.").font(.callout).foregroundStyle(.secondary)
            TextField("Email address", text: $model.email).textContentType(.username)
            SecureField("Password", text: $model.password).textContentType(.password)
                .onSubmit { Task { await model.signIn() } }
            HStack {
                Spacer()
                Button {
                    Task { await model.signIn() }
                } label: {
                    if model.busy { ProgressView().controlSize(.small) } else { Text("Continue") }
                }
                .buttonStyle(.borderedProminent).tint(purple)
                .disabled(model.busy || model.email.isEmpty || model.password.isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .textFieldStyle(.roundedBorder)
    }
}

struct PinView: View {
    @EnvironmentObject var model: VPNModel
    @FocusState private var focused: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Enter your PIN").font(.title3.bold())
            Text("Your six-digit staff PIN.").font(.callout).foregroundStyle(.secondary)
            ZStack {
                // A hidden field takes the typing; six boxes show how many digits have been entered.
                SecureField("", text: $model.pin)
                    .focused($focused)
                    .opacity(0.02)
                    .onChange(of: model.pin) { value in
                        let digits = String(value.filter(\.isNumber).prefix(6))
                        if digits != value { model.pin = digits }
                        if digits.count == 6 { Task { await model.submitPin() } }
                    }
                HStack(spacing: 8) {
                    ForEach(0..<6, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 9)
                            .strokeBorder(i == model.pin.count && focused ? purple : Color.secondary.opacity(0.35), lineWidth: i == model.pin.count && focused ? 2 : 1)
                            .background(RoundedRectangle(cornerRadius: 9).fill(Color(nsColor: .textBackgroundColor)))
                            .overlay(Circle().fill(Color.primary).frame(width: 9, height: 9).opacity(i < model.pin.count ? 1 : 0))
                            .frame(width: 38, height: 44)
                            .scaleEffect(i < model.pin.count ? 1.03 : 1)
                            .animation(.easeOut(duration: 0.12), value: model.pin.count)
                    }
                }
                .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .onTapGesture { focused = true }
            HStack {
                Button("Start again") { model.startAgain() }.buttonStyle(.link)
                Spacer()
                if model.busy { ProgressView().controlSize(.small) }
            }
        }
        .onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { focused = true } }
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
