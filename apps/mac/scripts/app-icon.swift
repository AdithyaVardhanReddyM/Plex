// Renders the Plex app icon from the logo mark (the paths are copied from Sources/UI/Wordmark.swift).
//   swift scripts/app-icon.swift Resources/Assets.xcassets/AppIcon.appiconset appicon:light
// Variants: light (the app icon), aqua, ink, glass. With a folder and plain variant names it writes 1024 px previews.
import AppKit
import SwiftUI
enum LogoPaths {
    static let markBox = CGSize(width: 41, height: 40)
    static let fullBox = CGSize(width: 153.1, height: 41)

    static let arc = svg("M33.724 36.5809C37.7426 32.5622 40.0003 27.1118 40.0003 21.4286C40.0003 15.7454 37.7426 10.2949 33.724 6.27629C29.7054 2.25765 24.2549 1.02188e-06 18.5717 0C12.8885 -1.02188e-06 7.43807 2.25764 3.41943 6.27628L10.4905 13.3473C11.6063 14.4631 13.4081 14.4074 14.8276 13.7181C15.9836 13.1568 17.2622 12.8571 18.5717 12.8571C20.845 12.8571 23.0252 13.7602 24.6326 15.3677C26.2401 16.9751 27.1431 19.1553 27.1431 21.4286C27.1431 22.7381 26.8435 24.0167 26.2822 25.1727C25.5929 26.5922 25.5372 28.394 26.6529 29.5098L33.724 36.5809Z")
    static let band = svg("M30 40H19.5098C17.9943 40 16.5408 39.398 15.4692 38.3263L1.67368 24.5308C0.60204 23.4592 0 22.0057 0 20.4902V10L30 40Z")
    static let corner = svg("M10.7143 39.9999H4.28571C1.91878 39.9999 0 38.0812 0 35.7142V29.2856L10.7143 39.9999Z")
    static let type = svg("M15.85 26.50L15.85 20.20L20.70 20.20L20.70 26.50L15.85 26.50ZM20.70 26.50L20.70 20.20Q23.10 20.20 24.82 19.77Q26.55 19.35 27.48 18.17Q28.40 17 28.40 14.75L28.40 14.75Q28.40 12.50 27.48 11.32Q26.55 10.15 24.82 9.72Q23.10 9.30 20.70 9.30L20.70 9.30L20.70 3Q25.25 3 28.68 4.15Q32.10 5.30 34.03 7.88Q35.95 10.45 35.95 14.75L35.95 14.75Q35.95 19 34.03 21.60Q32.10 24.20 28.68 25.35Q25.25 26.50 20.70 26.50L20.70 26.50ZM15.85 9.30L15.85 3L20.70 3L20.70 9.30L15.85 9.30ZM8.60 6.30L15.85 6.30L15.85 38L8.60 38L8.60 6.30ZM40.05 38L40.05 0.50L47.20 0.50L47.20 38L40.05 38ZM77.90 26.40L58.40 26.40L58.40 20.60L73.05 20.60L70.75 21.95Q71.00 20.50 70.48 19.02Q69.95 17.55 68.65 16.57Q67.35 15.60 65.15 15.60L65.15 15.60Q62.30 15.60 60.28 17.47Q58.25 19.35 58.40 23.10L58.40 23.10L50.85 23.10Q51.10 18.55 53.10 15.47Q55.10 12.40 58.25 10.80Q61.40 9.20 65.15 9.20L65.15 9.20Q68.00 9.20 70.55 10.35Q73.10 11.50 74.95 13.70Q76.80 15.90 77.65 19.10Q78.50 22.30 77.90 26.40L77.90 26.40ZM65.15 38.80L65.15 38.80Q61.25 38.80 58.23 37.25Q55.20 35.70 53.35 32.90Q51.50 30.10 51.00 26.40L51.00 26.40L58.40 26.40Q58.80 29 60.38 30.70Q61.95 32.40 65.15 32.40L65.15 32.40Q67.20 32.40 68.55 31.45Q69.90 30.50 70.45 29.10L70.45 29.10L78.00 29.10Q77.40 32 75.65 34.17Q73.90 36.35 71.23 37.58Q68.55 38.80 65.15 38.80ZM98.35 38L80.50 10L88.85 10L106.70 38L98.35 38ZM98.20 10L106.55 10L88.70 38L80.35 38L98.20 10Z")

    /// A path from SVG path data. The brand files only use absolute M, L, H, V, C, Q and Z.
    static func svg(_ data: String) -> Path {
        var tokens: [String] = []
        var number = ""
        func flush() { if !number.isEmpty { tokens.append(number); number = "" } }
        var previous: Character = " "
        for ch in data {
            if "MLHVCQZ".contains(ch) {
                flush(); tokens.append(String(ch))
            } else if ch == "-" && !(previous == "e" || previous == "E") {
                flush(); number = "-"
            } else if ch == " " || ch == "," {
                flush()
            } else if ch == "." && number.contains(".") && !number.contains("e") {
                flush(); number = "."
            } else {
                number.append(ch)
            }
            previous = ch
        }
        flush()

        var path = Path()
        var i = 0
        var command = "M"
        var current = CGPoint.zero
        func next() -> CGFloat { defer { i += 1 }; return CGFloat(Double(tokens[i]) ?? 0) }
        while i < tokens.count {
            if let c = tokens[i].first, "MLHVCQZ".contains(c) { command = tokens[i]; i += 1 }
            switch command {
            case "M": current = CGPoint(x: next(), y: next()); path.move(to: current); command = "L"
            case "L": current = CGPoint(x: next(), y: next()); path.addLine(to: current)
            case "H": current.x = next(); path.addLine(to: current)
            case "V": current.y = next(); path.addLine(to: current)
            case "C":
                let c1 = CGPoint(x: next(), y: next()), c2 = CGPoint(x: next(), y: next())
                current = CGPoint(x: next(), y: next())
                path.addCurve(to: current, control1: c1, control2: c2)
            case "Q":
                let c1 = CGPoint(x: next(), y: next())
                current = CGPoint(x: next(), y: next())
                path.addQuadCurve(to: current, control: c1)
            case "Z": path.closeSubpath(); if i < tokens.count, Double(tokens[i]) != nil { i += 1 }
            default: i += 1
            }
        }
        return path
    }
}


func hex(_ h: UInt32, _ a: CGFloat = 1) -> CGColor { CGColor(srgbRed: CGFloat((h>>16)&0xFF)/255, green: CGFloat((h>>8)&0xFF)/255, blue: CGFloat(h&0xFF)/255, alpha: a) }
let space = CGColorSpace(name: CGColorSpace.sRGB)!
func grad(_ cs: [CGColor], _ locs: [CGFloat]) -> CGGradient { CGGradient(colorsSpace: space, colors: cs as CFArray, locations: locs)! }

// variant: light | aqua | ink | glass
func render(_ variant: String, _ px: Int, _ url: URL) {
    let S = CGFloat(px)
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.translateBy(x: 0, y: S); ctx.scaleBy(x: 1, y: -1)
    let k = S / 1024
    let tile = CGRect(x: 100*k, y: 100*k, width: 824*k, height: 824*k)
    let r = 185*k
    let shape = CGPath(roundedRect: tile, cornerWidth: r, cornerHeight: r, transform: nil)
    // drop shadow under the tile
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 14*k), blur: 30*k, color: hex(0x0C2426, 0.30))
    ctx.addPath(shape); ctx.setFillColor(hex(0xFFFFFF)); ctx.fillPath()
    ctx.restoreGState()
    ctx.saveGState(); ctx.addPath(shape); ctx.clip()
    var arc = hex(0x0DCEDA), band = hex(0x6EF3D6), corner = hex(0x0C1512)
    switch variant {
    case "light":
        ctx.drawLinearGradient(grad([hex(0xFFFFFF), hex(0xF2FFFB), hex(0xD9FBF0)], [0, 0.55, 1]), start: CGPoint(x: tile.minX, y: tile.minY), end: CGPoint(x: tile.maxX, y: tile.maxY), options: [])
        ctx.drawRadialGradient(grad([hex(0x6EF3D6, 0.35), hex(0x6EF3D6, 0)], [0, 1]), startCenter: CGPoint(x: tile.maxX - 120*k, y: tile.maxY - 90*k), startRadius: 0, endCenter: CGPoint(x: tile.maxX - 120*k, y: tile.maxY - 90*k), endRadius: 520*k, options: [])
    case "aqua":
        ctx.drawLinearGradient(grad([hex(0x8CF7DF), hex(0x3EE0D8), hex(0x0DB8C8)], [0, 0.5, 1]), start: CGPoint(x: tile.minX, y: tile.minY), end: CGPoint(x: tile.maxX, y: tile.maxY), options: [])
        arc = hex(0xFFFFFF); band = hex(0xFFFFFF, 0.72); corner = hex(0x0C1512)
    case "ink":
        ctx.drawLinearGradient(grad([hex(0x1A2B28), hex(0x0C1512)], [0, 1]), start: CGPoint(x: tile.minX, y: tile.minY), end: CGPoint(x: tile.maxX, y: tile.maxY), options: [])
        ctx.drawRadialGradient(grad([hex(0x0DCEDA, 0.42), hex(0x0DCEDA, 0)], [0, 1]), startCenter: CGPoint(x: tile.midX + 40*k, y: tile.midY - 20*k), startRadius: 0, endCenter: CGPoint(x: tile.midX + 40*k, y: tile.midY - 20*k), endRadius: 470*k, options: [])
        corner = hex(0xFFFFFF)
    default: // glass: mint-to-aqua frosted tile, mark in deep ink-teal
        ctx.drawLinearGradient(grad([hex(0xEBFFFA), hex(0xB6F9E6), hex(0x7DE9E4)], [0, 0.5, 1]), start: CGPoint(x: tile.minX, y: tile.minY), end: CGPoint(x: tile.maxX, y: tile.maxY), options: [])
        arc = hex(0x0DCEDA); band = hex(0xFFFFFF); corner = hex(0x0C1512)
    }
    // top sheen
    ctx.drawLinearGradient(grad([hex(0xFFFFFF, variant == "ink" ? 0.10 : 0.45), hex(0xFFFFFF, 0)], [0, 1]), start: CGPoint(x: 0, y: tile.minY), end: CGPoint(x: 0, y: tile.minY + 360*k), options: [])
    // the mark, with a soft shadow of its own
    let markH = 470*k, s = markH / 40
    let ox = tile.midX - 41*s/2 + 6*k, oy = tile.midY - markH/2 + 8*k
    let t = CGAffineTransform(translationX: ox, y: oy).scaledBy(x: s, y: s)
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 16*k), blur: 34*k, color: variant == "ink" ? hex(0x0DCEDA, 0.35) : hex(0x0C4344, 0.25))
    ctx.beginTransparencyLayer(auxiliaryInfo: nil)
    for (p, c) in [(LogoPaths.arc, arc), (LogoPaths.band, band), (LogoPaths.corner, corner)] {
        ctx.addPath(p.cgPath.copy(using: [t])!); ctx.setFillColor(c); ctx.fillPath()
    }
    ctx.endTransparencyLayer()
    ctx.restoreGState()
    // glossy highlight on the arc (light variants)
    if variant != "ink" {
        ctx.saveGState()
        ctx.addPath(LogoPaths.arc.cgPath.copy(using: [t])!); ctx.clip()
        ctx.drawLinearGradient(grad([hex(0xFFFFFF, 0.38), hex(0xFFFFFF, 0)], [0, 1]), start: CGPoint(x: 0, y: oy), end: CGPoint(x: 0, y: oy + markH*0.55), options: [])
        ctx.restoreGState()
    }
    ctx.restoreGState()
    // hairline edge
    ctx.addPath(shape); ctx.setStrokeColor(variant == "ink" ? hex(0xFFFFFF, 0.10) : hex(0x0C1512, 0.07)); ctx.setLineWidth(max(1, 2*k)); ctx.strokePath()
    let img = ctx.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    try! rep.representation(using: .png, properties: [:])!.write(to: url)
}
let args = CommandLine.arguments
let outDir = args[1]
let variants = args.count > 2 ? Array(args[2...]) : ["light", "aqua", "ink", "glass"]
for v in variants {
    if v.hasPrefix("appicon:") {
        let name = String(v.dropFirst(8)); let dir = args[1]
        for px in [16, 32, 64, 128, 256, 512, 1024] { render(name, px, URL(fileURLWithPath: "\(dir)/icon_\(px).png")) }
    } else {
        render(v, 1024, URL(fileURLWithPath: "\(outDir)/\(v).png"))
    }
}
print("ok")
