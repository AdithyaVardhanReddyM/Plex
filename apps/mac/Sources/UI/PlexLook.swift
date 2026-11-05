import AppKit
import SwiftUI

// Plex's light-window look (onboarding): an aurora wash in mint, aqua and steel that melts into
// the canvas, glossy 3D icons on white tiles, capsule buttons, page dots, and the talk keys.
// The island has its own dark look (IslandGlass.swift); its gradients are at the bottom here.

extension EnvironmentValues {
    /// Drawing a still (ImageRenderer): no animation, AppKit fields as placeholders.
    @Entry var stillRender = false
}

enum Aurora {
    static let mint = Color(hex: 0x3ECF8E)
    static let mintSoft = Color(hex: 0xA5ECC8)
    static let aqua = Color(hex: 0x8FE3DA)
    static let aquaSoft = Color(hex: 0xC9F1EC)
    static let steel = Color(hex: 0x9CB4D2)
    static let steelSoft = Color(hex: 0xC4D3E6)

    /// Mint to aqua to steel: the one gradient Plex uses for life (never purple).
    static let sweep = LinearGradient(colors: [mint, aqua, steel], startPoint: .leading, endPoint: .trailing)
    static let sweepSoft = LinearGradient(colors: [mintSoft, aquaSoft, steelSoft], startPoint: .leading, endPoint: .trailing)
}

/// A soft mesh of mint, aqua and steel that drifts slowly; its bottom row is the canvas, so it
/// melts into the page below.
struct AuroraWash: View {
    var base: Color = Plex.canvas
    @Environment(\.stillRender) private var still

    var body: some View {
        if still {
            mesh(0)
        } else {
            TimelineView(.animation(minimumInterval: 1 / 30)) { context in
                mesh(context.date.timeIntervalSinceReferenceDate)
            }
        }
    }

    private func mesh(_ t: Double) -> some View {
        func wobble(_ phase: Double, _ amount: Float = 0.07) -> Float { Float(sin(t * 0.3 + phase)) * amount }
        return MeshGradient(width: 3, height: 3, points: [
            [0, 0], [0.5 + wobble(0.3), 0], [1, 0],
            [0, 0.5 + wobble(1.2, 0.05)], [0.5 + wobble(2.1), 0.48 + wobble(0.7, 0.06)], [1, 0.45 + wobble(2.8, 0.05)],
            [0, 1], [0.5, 1], [1, 1],
        ], colors: [
            Aurora.mintSoft, Aurora.aqua.opacity(0.85), Aurora.steelSoft,
            Color(hex: 0xDDF7EA), Color(hex: 0xDDF4F2), Color(hex: 0xE3EAF4),
            base, base, base,
        ])
    }
}

/// One of the glossy 3D icons (Assets > Glossy: plex-mint-*, plex-steel-*, plex-money-*).
struct GlossyIcon: View {
    let name: String
    var floating = false
    var phase: Double = 0
    @Environment(\.stillRender) private var still

    init(_ name: String, floating: Bool = false, phase: Double = 0) {
        self.name = name
        self.floating = floating
        self.phase = phase
    }

    var body: some View {
        let image = Image(name).resizable().interpolation(.high).scaledToFit()
        if floating, !still {
            TimelineView(.animation(minimumInterval: 1 / 30)) { context in
                image.offset(y: CGFloat(sin(context.date.timeIntervalSinceReferenceDate * 1.2 + phase)) * 4)
            }
        } else {
            image
        }
    }
}

/// A glossy icon (or a logo) on a white, softly shadowed tile: the app-icon look.
struct GlossyTile: View {
    let image: String
    var size: CGFloat = 48
    /// A logo fills less of the tile than a glossy icon.
    var logo = false

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            .fill(.white)
            .overlay(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous).strokeBorder(Plex.line, lineWidth: 0.5))
            .overlay(GlossyIcon(image).padding(size * (logo ? 0.22 : 0.12)))
            .frame(width: size, height: size)
            .shadow(color: Plex.steel900.opacity(0.08), radius: size * 0.16, y: size * 0.06)
    }
}

// MARK: Buttons

/// The main action: a black capsule, with an arrow in a white circle when it moves on.
struct CapsulePrimaryButton: ButtonStyle {
    var arrow = true
    var compact = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 10) {
            configuration.label
                .font(.system(size: compact ? 12.5 : 14, weight: .semibold))
            if arrow {
                Image(systemName: "arrow.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Plex.ink)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(.white))
            }
        }
        .foregroundStyle(.white)
        .padding(.leading, compact ? 14 : 20)
        .padding(.trailing, arrow ? 6 : (compact ? 14 : 20))
        .frame(height: compact ? 30 : 38)
        .background(Capsule().fill(Plex.ink))
        .opacity(enabled ? (configuration.isPressed ? 0.85 : 1) : 0.35)
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// A quiet white capsule (Back, Allow, Connect).
struct CapsuleSecondaryButton: ButtonStyle {
    var symbol: String?
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            if let symbol { Image(systemName: symbol).font(.system(size: compact ? 11 : 12, weight: .semibold)) }
            configuration.label
        }
        .font(.system(size: compact ? 12.5 : 13.5, weight: .semibold))
        .foregroundStyle(Plex.ink)
        .padding(.horizontal, compact ? 12 : 16)
        .frame(height: compact ? 28 : 38)
        .background(Capsule().fill(configuration.isPressed ? Plex.sunken : (compact ? Plex.sunken : .white)))
        .overlay(Capsule().strokeBorder(compact ? .clear : Plex.line, lineWidth: 0.5))
        .shadow(color: compact ? .clear : Plex.steel900.opacity(0.06), radius: 6, y: 2)
    }
}

/// Where you are in a flow: the current step a longer ink capsule.
struct StepDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(i == current ? Plex.ink : Plex.lineStrong)
                    .frame(width: i == current ? 22 : 7, height: 7)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: current)
    }
}

/// A round close button for a borderless window.
struct CircleCloseButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Plex.ink2)
                .frame(width: 30, height: 30)
                .background(Circle().fill(.white.opacity(0.85)))
                .overlay(Circle().strokeBorder(Plex.line, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .help("Close")
    }
}

// MARK: Island gradients

enum IslandGlow {
    /// Round the island's edge while Plex listens or thinks.
    static let ring = AngularGradient(colors: [
        Color(hex: 0x3ECF8E), Color(hex: 0x8FE3DA), Color(hex: 0x9CB4D2), Color(hex: 0x6EDCAA), Color(hex: 0x3ECF8E),
    ], center: .center)

    /// Money that moved, as text: green-200 into the signal mint.
    static let money = LinearGradient(stops: [
        .init(color: Color(hex: 0xF0FDF6), location: 0.05),
        .init(color: Color(hex: 0xA5ECC8), location: 0.45),
        .init(color: Color(hex: 0x3ECF8E), location: 0.95),
    ], startPoint: .top, endPoint: .bottom)

    /// Money that's held: steel catching light.
    static let held = LinearGradient(colors: [Color(hex: 0xE1E9F3), Color(hex: 0x9CB4D2), Color(hex: 0x7393BD)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing)
}
