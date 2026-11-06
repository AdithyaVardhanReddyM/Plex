import AppKit
import SwiftUI

/// Plex's design tokens, mirrored from apps/web/src/app/globals.css. The main window is light only;
/// the island stays black glass (it merges with the notch) and uses the `onDark` set.
///
/// Green is for money that moved. Steel blue is for money that's held, waiting or needs you.
/// Use these, never raw colors, in new views.
enum Plex {
    // Surfaces
    static let canvas = Color(hex: 0xF6F8F7)
    static let surface = Color.white
    static let sunken = Color(hex: 0xEFF2F1)
    static let line = Color(hex: 0xE2E7E5)
    static let lineStrong = Color(hex: 0xCFD7D4)

    // Type
    static let ink = Color(hex: 0x0C1512)
    static let ink2 = Color(hex: 0x34403C)
    static let muted = Color(hex: 0x5F6B67)
    static let faint = Color(hex: 0x8D9893)

    // Brand mint to aqua (#EBFFFA #C6FCE5 #6EF3D6 #0DCEDA): money that moved. Names stay green*.
    // 300-500 are fills: ink text on them, never white. 700/800 carry text on white.
    static let green50 = Color(hex: 0xEBFFFA)
    static let green100 = Color(hex: 0xC6FCE5)
    static let green200 = Color(hex: 0x9AF8DE)
    static let green300 = Color(hex: 0x6EF3D6)
    static let green400 = Color(hex: 0x3EE0D8) // the signal
    static let green500 = Color(hex: 0x0DCEDA)
    static let green600 = Color(hex: 0x0D969E)
    static let green700 = Color(hex: 0x0D8086)
    static let green800 = Color(hex: 0x0C5F62)

    // Steel: money that's held, waiting, or needs you
    static let steel50 = Color(hex: 0xF1F5FA)
    static let steel100 = Color(hex: 0xE1E9F3)
    static let steel200 = Color(hex: 0xC4D3E6)
    static let steel300 = Color(hex: 0x9CB4D2)
    static let steel400 = Color(hex: 0x7393BD)
    static let steel500 = Color(hex: 0x5376A5)
    static let steel600 = Color(hex: 0x3F5F8C)
    static let steel700 = Color(hex: 0x314B71)
    static let steel900 = Color(hex: 0x18263B)

    // States
    static let refunded = Color(hex: 0xB26B12)
    static let refundedBg = Color(hex: 0xFDF3E2)
    static let disputed = Color(hex: 0xC2412D)
    static let disputedBg = Color(hex: 0xFDECEA)

    /// The receipt's foil edge and anything "held".
    static let metal = LinearGradient(
        stops: [
            .init(color: Color(hex: 0xEEF3F9), location: 0),
            .init(color: Color(hex: 0xB8C8DC), location: 0.28),
            .init(color: Color(hex: 0x6F8DB3), location: 0.52),
            .init(color: Color(hex: 0xC9D7E8), location: 0.74),
            .init(color: Color(hex: 0xF3F6FA), location: 1),
        ],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let metalSoft = LinearGradient(
        colors: [Color(hex: 0xF6F9FC), Color(hex: 0xDBE5F0), Color(hex: 0xC1D0E2), Color(hex: 0xEEF3F8)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    // Radii
    static let radiusXS: CGFloat = 6
    static let radiusSM: CGFloat = 8
    static let radiusMD: CGFloat = 12
    static let radiusLG: CGFloat = 16
    static let radiusXL: CGFloat = 22

    /// On the black island.
    enum OnDark {
        static let text = Color.white
        static let secondary = Color.white.opacity(0.62)
        static let tertiary = Color.white.opacity(0.4)
        static let hairline = Color.white.opacity(0.1)
        static let fill = Color.white.opacity(0.07)
        static let fillStrong = Color.white.opacity(0.12)
        static let green = Color(hex: 0x6EF3D6)
        static let steel = Color(hex: 0x9CB4D2)
        static let warn = Color(hex: 0xF0B35A)
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

extension View {
    /// A white card on the canvas: hairline border and the web's `--shadow-card`.
    func plexCard(radius: CGFloat = Plex.radiusLG, padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(Plex.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Plex.line))
            .shadow(color: Plex.ink.opacity(0.04), radius: 1, y: 1)
    }
}

/// Integer cents, formatted the way the web's `formatCents` does: "$1,850.00", or "$84" when `whole`.
enum Money {
    static func format(_ cents: Int, whole: Bool = false, currency: String = "USD") -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency
        f.locale = Locale(identifier: "en_US")
        let hasCents = cents % 100 != 0
        f.minimumFractionDigits = whole && !hasCents ? 0 : 2
        f.maximumFractionDigits = whole && !hasCents ? 0 : 2
        return f.string(from: NSNumber(value: Double(cents) / 100)) ?? "$\(cents / 100)"
    }
}
