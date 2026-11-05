import AppKit
import SwiftUI

/// Plex's wordmark: plain type, semibold, slightly tight. There is no logo mark.
struct Wordmark: View {
    var size: CGFloat = 13
    var color: Color = Plex.ink

    var body: some View {
        Text("Plex")
            .font(.system(size: size, weight: .semibold))
            .tracking(-0.02 * size)
            .foregroundStyle(color)
    }
}

enum MenuBarIcon {
    /// A template receipt from SF Symbols: Plex is agents, with receipts.
    @MainActor static let image: NSImage = {
        let config = NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)
        let image = (NSImage(systemSymbolName: "receipt", accessibilityDescription: "Plex")
            ?? NSImage(systemSymbolName: "doc.plaintext", accessibilityDescription: "Plex")!)
            .withSymbolConfiguration(config) ?? NSImage()
        image.isTemplate = true
        return image
    }()
}

extension NSColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
}
