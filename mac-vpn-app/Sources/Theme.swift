import SwiftUI
import AppKit
import CoreText

/// The authorised HN Group look: Plus Jakarta Sans, the HN palette and stripe, purple actions,
/// rounded cards and soft shadows, in light and dark.
enum Theme {
    // HN Group palette.
    static let pink = Color(hex: 0xE97DE8)
    static let purple = Color(hex: 0x5514B4)
    static let yellow = Color(hex: 0xE3E65B)
    static let teal = Color(hex: 0x3E9BA3)
    static let plum = Color(hex: 0x7A1F6C)
    static let raspberry = Color(hex: 0xC2306B)
    static let green = Color(hex: 0x5FAE7B)
    static let navy = Color(hex: 0x1C2135)

    // Surfaces and text, matching the staff portal in light and dark.
    static let background = Color.dynamic(light: 0xF6F4FA, dark: 0x0E1020)
    static let surface = Color.dynamic(light: 0xFFFFFF, dark: 0x161A2E)
    static let surface2 = Color.dynamic(light: 0xF8F7FB, dark: 0x1C2138)
    static let text = Color.dynamic(light: 0x1B1A21, dark: 0xECEBF4)
    static let muted = Color.dynamic(light: 0x5E6070, dark: 0xA4A7BA)
    static let border = Color.dynamic(light: 0xE2DDEB, dark: 0x2A2F4A)
    static let accent = Color.dynamic(light: 0x5514B4, dark: 0xB794F6)
    static let accentSoft = Color.dynamic(light: 0xEEE6FA, dark: 0x2A2350)
    static let success = Color.dynamic(light: 0x2E7D4F, dark: 0x7CD3A0)
    static let danger = Color.dynamic(light: 0xB4234F, dark: 0xF28AA8)

    /// The eight-colour HN stripe, with its proportions.
    static let stripe: [(Color, CGFloat)] = [(pink, 14), (purple, 14), (yellow, 6), (teal, 20), (plum, 10), (raspberry, 10), (green, 13), (navy, 13)]

    // Deep night tones for the hero panels, and the brand gradients.
    static let night = Color(hex: 0x0D0B1F)
    static let nightRaised = Color(hex: 0x1B1640)
    static let violet = Color(hex: 0x7B3FF2)
    static let brand = LinearGradient(colors: [Color(hex: 0x6A1FD8), Theme.purple, Color(hex: 0x2B0D6B)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let heroOn = LinearGradient(colors: [Color(hex: 0x2A0F6E), Color(hex: 0x16124A), Color(hex: 0x0E2A3A)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let heroOff = LinearGradient(colors: [Color(hex: 0x17152B), Color(hex: 0x100E22)], startPoint: .topLeading, endPoint: .bottomTrailing)
    /// The HN stripe's colours as a ring (for the connect orb).
    static let ring = AngularGradient(colors: [pink, purple, teal, green, yellow, raspberry, pink], center: .center)
    static let radius: CGFloat = 18

    static func font(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .custom("Plus Jakarta Sans", size: size).weight(weight)
    }

    /// Makes the bundled Plus Jakarta Sans available to the app.
    static func registerFont() {
        guard let url = Bundle.main.url(forResource: "PlusJakartaSans", withExtension: "ttf") else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }

    static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let hex = isDark ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        })
    }
}

/// The HN stripe as a bar.
struct HNStripe: View {
    var body: some View {
        GeometryReader { geo in
            let total = Theme.stripe.reduce(0) { $0 + $1.1 }
            HStack(spacing: 0) {
                ForEach(0..<Theme.stripe.count, id: \.self) { i in
                    Theme.stripe[i].0.frame(width: geo.size.width * Theme.stripe[i].1 / total)
                }
            }
        }
    }
}

/// The approved HN Group wordmark, light or dark.
struct HNWordmark: View {
    @Environment(\.colorScheme) private var scheme
    let height: CGFloat
    init(height: CGFloat = 30) { self.height = height }
    var body: some View {
        if let url = Bundle.main.url(forResource: scheme == .dark ? "wordmark-white" : "wordmark", withExtension: "png"), let image = NSImage(contentsOf: url) {
            Image(nsImage: image).resizable().interpolation(.high).aspectRatio(contentMode: .fit).frame(height: height)
                .accessibilityLabel("HN Group")
        } else {
            Text("HN Group").font(Theme.font(height * 0.6, .bold))
        }
    }
}

/// A rounded HN card.
struct Card<Content: View>: View {
    var padding: CGFloat = 22
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).fill(Theme.surface))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).strokeBorder(Theme.border.opacity(0.8)))
            .shadow(color: Color.black.opacity(0.05), radius: 10, y: 4)
    }
}

/// The window's native translucent material (used for the sidebar).
struct VisualEffect: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .sidebar
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material; view.blendingMode = .behindWindow; view.state = .followsWindowActiveState
        return view
    }
    func updateNSView(_ view: NSVisualEffectView, context: Context) { view.material = material }
}

/// The HN Secure Network mark: a shield on the brand gradient.
struct AppMark: View {
    var size: CGFloat = 34
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).fill(Theme.brand)
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).strokeBorder(Color.white.opacity(0.18))
            Image(systemName: "lock.shield.fill").font(.system(size: size * 0.5, weight: .semibold)).foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .shadow(color: Theme.purple.opacity(0.35), radius: size * 0.2, y: size * 0.08)
        .accessibilityHidden(true)
    }
}

/// HN buttons: purple pill for the main action, outlined for others.
struct HNButtonStyle: ButtonStyle {
    let primary: Bool
    let wide: Bool
    init(primary: Bool = true, wide: Bool = false) { self.primary = primary; self.wide = wide }
    func makeBody(configuration: Configuration) -> some View {
        HNButtonLabel(configuration: configuration, primary: primary, wide: wide)
    }
}

private struct HNButtonLabel: View {
    let configuration: ButtonStyleConfiguration
    let primary: Bool
    let wide: Bool
    @Environment(\.isEnabled) private var enabled
    @State private var hover = false
    var body: some View {
        configuration.label
            .font(Theme.font(13.5, .bold))
            .foregroundStyle(primary ? Color.white : Theme.text)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .frame(maxWidth: wide ? .infinity : nil)
            .background(
                Capsule().fill(primary ? AnyShapeStyle(Theme.brand) : AnyShapeStyle(configuration.isPressed ? Theme.accentSoft : hover ? Theme.surface2 : Theme.surface))
            )
            .overlay(Capsule().strokeBorder(primary ? Color.white.opacity(0.14) : Theme.border, lineWidth: 1))
            .shadow(color: primary && enabled ? Theme.purple.opacity(hover ? 0.4 : 0.25) : .clear, radius: hover ? 12 : 8, y: 4)
            .brightness(primary && hover && enabled ? 0.05 : 0)
            .opacity(enabled ? 1 : 0.5)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
            .animation(.easeOut(duration: 0.15), value: hover)
            .contentShape(Capsule())
            .onHover { hover = $0 }
    }
}

/// A small coloured label, like the portal's badges.
struct Badge: View {
    let text: String
    var colour: Color = Theme.accent
    var body: some View {
        Text(text).font(Theme.font(11, .bold)).textCase(.uppercase).tracking(0.6)
            .foregroundStyle(colour)
            .lineLimit(1).fixedSize()
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Capsule().fill(colour.opacity(0.16)))
            .overlay(Capsule().strokeBorder(colour.opacity(0.28)))
    }
}
