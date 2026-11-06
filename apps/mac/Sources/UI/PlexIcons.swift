import AppKit
import SwiftUI

// Plex for Mac has one icon set: Lucide, the web app's set, drawn from the vector assets in
// Assets > Lucide (`lucide-<name>`, made by scripts/lucide-icons.mjs). Two ways to show one:
//  - PlexIcon: the bare line glyph, beside text (the sidebar, section titles, badges, buttons).
//  - PlexIconTile: the glyph on a soft tile, where an icon stands for a thing (a page, a routine, a pot).
// Mint is the default; steel is for what's held, waiting or needs you; glass is for the black island.
// Keycap legends (fn, control, option, command) stay SF Symbols: they're keyboard glyphs, not icons.

/// A Lucide glyph. `size` matches a font size: the glyph's ink is about that tall.
struct PlexIcon: View {
    let symbol: String
    var size: CGFloat = 13
    /// nil takes the surrounding foreground style (buttons, labels).
    var color: Color? = Plex.muted

    var body: some View {
        let image = Image(PlexIcon.asset(symbol))
            .renderingMode(.template)
            .resizable()
            .interpolation(.high)
            .frame(width: size * 1.2, height: size * 1.2)
        if let color { image.foregroundStyle(color) } else { image }
    }

    /// The asset for a Lucide name, or a neutral fallback (logged in debug builds) when it's missing.
    static func asset(_ name: String) -> String {
        let key = "lucide-\(name)"
        if NSImage(named: key) != nil { return key }
        #if DEBUG
        print("[icons] missing Lucide icon \"\(name)\"; add it to scripts/lucide-icons.txt")
        #endif
        return "lucide-circle"
    }

    static func exists(_ name: String) -> Bool { NSImage(named: "lucide-\(name)") != nil }
}

/// A Lucide glyph on a soft tile: a mint (or steel) wash, a hairline, a white lip on top.
struct PlexIconTile: View {
    enum Tint { case neutral, green, steel, amber, ink, glass }
    let symbol: String
    var tint: Tint = .green
    var size: CGFloat = 30

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
        shape
            .fill(LinearGradient(colors: fill, startPoint: .top, endPoint: .bottom))
            .overlay(shape.strokeBorder(border, lineWidth: 1))
            .overlay(shape.inset(by: 1).strokeBorder(
                LinearGradient(colors: [.white.opacity(lip), .clear], startPoint: .top, endPoint: .center),
                lineWidth: 1))
            .overlay(PlexIcon(symbol: symbol, size: size * 0.44, color: foreground))
            .frame(width: size, height: size)
            .shadow(color: shadow, radius: size * 0.1, y: size * 0.04)
    }

    private var lip: Double {
        switch tint {
        case .ink: 0.12
        case .glass: 0.16
        default: 0.9
        }
    }

    private var fill: [Color] {
        switch tint {
        case .glass: [.white.opacity(0.13), .white.opacity(0.05)]
        case .neutral: [Plex.surface, Plex.sunken]
        case .green: [Plex.green50, Plex.green100]
        case .steel: [Plex.steel50, Plex.steel100]
        case .amber: [Plex.refundedBg, Plex.refundedBg]
        case .ink: [Plex.ink2, Plex.ink]
        }
    }

    private var border: Color {
        switch tint {
        case .glass: .white.opacity(0.1)
        case .neutral: Plex.line
        case .green: Plex.green200.opacity(0.8)
        case .steel: Plex.steel200.opacity(0.8)
        case .amber: Plex.refunded.opacity(0.15)
        case .ink: .clear
        }
    }

    var foreground: Color { Self.foreground(tint) }

    static func foreground(_ tint: Tint) -> Color {
        switch tint {
        case .glass: Plex.OnDark.green
        case .neutral: Plex.ink2
        case .green: Plex.green800
        case .steel: Plex.steel700
        case .amber: Plex.refunded
        case .ink: .white
        }
    }

    private var shadow: Color {
        switch tint {
        case .green: Plex.green700.opacity(0.10)
        case .steel: Plex.steel700.opacity(0.10)
        case .glass: .clear
        default: Color(hex: 0x0C2426, opacity: 0.07)
        }
    }
}

/// A Label with a Lucide icon, for buttons ("New routine", "Run now").
struct PlexLabel: View {
    let title: String
    let icon: String

    init(_ title: String, icon: String) {
        self.title = title
        self.icon = icon
    }

    var body: some View {
        Label { Text(title) } icon: { PlexIcon(symbol: icon, size: 12, color: nil) }
    }
}
