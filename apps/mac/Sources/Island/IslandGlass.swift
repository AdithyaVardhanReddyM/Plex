import AppKit
import SwiftUI

/// The island's look: black where it meets the notch, dark frosted glass below (the desktop
/// behind it shows through, blurred), neutral grey cards with a lighter header strip. It never
/// follows the light theme: it has to match the notch.
///
/// Plex's colors mean the same here as on the web: green is money that moved (and the one
/// button that moves it), steel is money held, waiting, or something that needs you.
enum IslandStyle {
    static let card = Color(hex: 0x1C1D21)
    static let header = Color(hex: 0x26272C)
    /// The strip on a card that's waiting for you: steel, not a border.
    static let waiting = Color(hex: 0x1F2A3A)
    static let raised = Color(hex: 0x2A2B31)
    static let line = Plex.OnDark.hairline
    /// Needs you, held, waiting.
    static let accent = Plex.OnDark.steel
    /// Money that moved.
    static let money = Plex.OnDark.green
    static let text = Color.white.opacity(0.94)
    static let text2 = Plex.OnDark.secondary
    static let text3 = Plex.OnDark.tertiary
    static let good = Plex.OnDark.green
    static let bad = Color(hex: 0xF08A7E)
    /// Ink for text on the green button.
    static let onMoney = Color(hex: 0x05261A)

    /// The receipt's foil edge, tuned for black: mint into steel, catching white light in the middle.
    static let foil = LinearGradient(
        stops: [
            .init(color: Color(hex: 0x3ECF8E), location: 0),
            .init(color: Color(hex: 0xA5ECC8), location: 0.28),
            .init(color: Color(hex: 0xF4FBF8), location: 0.48),
            .init(color: Color(hex: 0xC4D3E6), location: 0.66),
            .init(color: Color(hex: 0x7393BD), location: 1),
        ],
        startPoint: .top, endPoint: .bottom
    )

    /// The approval card's edge: steel, held, catching a little light.
    static let heldStrip = LinearGradient(
        stops: [
            .init(color: Color(hex: 0x5376A5), location: 0),
            .init(color: Color(hex: 0xC4D3E6), location: 0.4),
            .init(color: Color(hex: 0xEEF3F9), location: 0.55),
            .init(color: Color(hex: 0x7393BD), location: 1),
        ],
        startPoint: .top, endPoint: .bottom
    )
}

/// The island's shell: the notch shape in black glass. `solidTop` points stay pure black so the
/// shell melts into the notch; below, the blurred desktop shows faintly through.
struct IslandShell: View {
    let shape: NotchShape
    let height: CGFloat
    let solidTop: CGFloat
    let glass: Bool
    var rendering = false

    var body: some View {
        ZStack {
            if glass, !rendering {
                BehindWindowBlur().clipShape(shape)
            }
            shape.fill(LinearGradient(stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: min(0.98, solidTop / max(height, 1))),
                .init(color: .black.opacity(glass ? 0.88 : 1), location: min(1, (solidTop + 40) / max(height, 1))),
                .init(color: .black.opacity(glass ? 0.8 : 1), location: 1),
            ], startPoint: .top, endPoint: .bottom))
        }
    }
}

/// What's behind the window, blurred (NSVisualEffectView): the glass in the island's shell.
private struct BehindWindowBlur: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        view.appearance = NSAppearance(named: .darkAqua)
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

/// A card inside the island: a lighter header strip over a grey body.
struct IslandCard<Header: View, Content: View>: View {
    var highlighted = false
    /// A thin metallic edge on the left (the approval card's steel).
    var strip: LinearGradient? = nil
    @ViewBuilder var header: Header
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
                .padding(.horizontal, 12)
                .frame(height: 36)
                .frame(maxWidth: .infinity, alignment: .leading)
                // No borders in the island: the one waiting for you gets a steel strip instead.
                .background(highlighted ? IslandStyle.waiting : IslandStyle.header)
            VStack(alignment: .leading, spacing: 9) { content }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(IslandStyle.card)
        .overlay(alignment: .leading) {
            if let strip {
                ZStack {
                    Rectangle().fill(strip).frame(width: 3)
                    Rectangle().fill(strip).frame(width: 8).blur(radius: 6).opacity(0.5)
                }
                .frame(width: 8, alignment: .leading)
                .frame(maxHeight: .infinity)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// A small white tag with dark capitals on a dark surface ("BRAND", "VINYL").
struct IslandTag: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 8.5, weight: .bold).italic())
            .tracking(0.4)
            .foregroundStyle(Color(hex: 0x111216))
            .padding(.horizontal, 5)
            .padding(.vertical, 2.5)
            .background(RoundedRectangle(cornerRadius: 3, style: .continuous).fill(.white))
            .fixedSize()
    }
}
