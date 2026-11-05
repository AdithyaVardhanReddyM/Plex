import AppKit
import PDFKit
import UniformTypeIdentifiers

/// When the user last used an app, so Plex can tell a subscription nobody opens from one in use.
/// Running apps count as used now; otherwise Spotlight's last-used date (kMDItemLastUsedDate).
@MainActor
enum AppUsageTool {
    /// `{apps: string[]}` → `{usage: {app, running, lastUsedAt?}[]}` (lastUsedAt in ms since 1970).
    static func usage(_ args: JSONValue?) -> Result<JSONValue, LocalTools.Failure> {
        let names = args?["apps"]?.array.compactMap(\.string) ?? []
        guard !names.isEmpty else { return .failure(.init(message: "Say which apps to look up.")) }
        let running = NSWorkspace.shared.runningApplications
        let rows: [JSONValue] = names.prefix(40).map { name in
            var row: [String: JSONValue] = ["app": .string(name)]
            let isRunning = running.contains { $0.localizedName?.caseInsensitiveCompare(name) == .orderedSame }
            row["running"] = .bool(isRunning)
            if isRunning {
                row["lastUsedAt"] = .number((Date().timeIntervalSince1970 * 1000).rounded())
            } else if let url = appURL(name), let date = lastUsed(url) {
                row["lastUsedAt"] = .number((date.timeIntervalSince1970 * 1000).rounded())
                row["path"] = .string(url.path)
            } else if let url = appURL(name) {
                row["path"] = .string(url.path)
            } else {
                row["installed"] = false
            }
            return .object(row)
        }
        return .success(["usage": .array(rows)])
    }

    private static func appURL(_ name: String) -> URL? {
        let file = name.hasSuffix(".app") ? name : name + ".app"
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        for dir in ["/Applications", "/Applications/Utilities", "/System/Applications", home + "/Applications"] {
            let path = "\(dir)/\(file)"
            if FileManager.default.fileExists(atPath: path) { return URL(fileURLWithPath: path) }
        }
        return NSWorkspace.shared.urlForApplication(withBundleIdentifier: name)
    }

    private static func lastUsed(_ url: URL) -> Date? {
        guard let item = MDItemCreateWithURL(kCFAllocatorDefault, url as CFURL) else { return nil }
        return MDItemCopyAttribute(item, kMDItemLastUsedDate) as? Date
    }
}

/// Reads a file the user dropped or pointed at (a bill, a receipt): the text of a text file or
/// PDF, or an image as base64 for the model to look at.
enum ReadFileTool {
    private static let maxText = 60_000
    private static let maxImageBytes = 6 << 20
    private static let maxImageSide: CGFloat = 1800

    /// `{path}` → `{text?, image?, mime, pages?, name}`.
    static func read(_ args: JSONValue?) -> Result<JSONValue, LocalTools.Failure> {
        var path = args?["path"]?.string ?? ""
        if path.hasPrefix("~") { path = (path as NSString).expandingTildeInPath }
        let url = URL(fileURLWithPath: path)
        guard !path.isEmpty, FileManager.default.isReadableFile(atPath: path) else {
            return .failure(.init(message: "Plex can't read \(path.isEmpty ? "that file" : path)."))
        }
        let type = UTType(filenameExtension: url.pathExtension) ?? .data
        let mime = type.preferredMIMEType ?? "application/octet-stream"
        var out: [String: JSONValue] = ["name": .string(url.lastPathComponent), "mime": .string(mime)]

        if type.conforms(to: .pdf) {
            guard let doc = PDFDocument(url: url) else { return .failure(.init(message: "That PDF won't open.")) }
            out["pages"] = .number(Double(doc.pageCount))
            let text = doc.string ?? ""
            if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let page = doc.page(at: 0) {
                // A scanned PDF has no text: send its first page as a picture instead.
                let image = page.thumbnail(of: CGSize(width: maxImageSide, height: maxImageSide), for: .mediaBox)
                if let data = jpeg(image) {
                    out["image"] = .string(data.base64EncodedString())
                    out["mime"] = "image/jpeg"
                }
            } else {
                out["text"] = .string(cut(text))
            }
            return .success(.object(out))
        }
        if type.conforms(to: .image) {
            guard let image = NSImage(contentsOf: url), let data = jpeg(image), data.count <= maxImageBytes else {
                return .failure(.init(message: "That picture is too large or won't open."))
            }
            out["image"] = .string(data.base64EncodedString())
            out["mime"] = "image/jpeg"
            return .success(.object(out))
        }
        if type.conforms(to: .text) || type.conforms(to: .commaSeparatedText) || type.conforms(to: .json) || url.pathExtension.isEmpty {
            guard let data = FileManager.default.contents(atPath: path) else { return .failure(.init(message: "That file is empty.")) }
            out["text"] = .string(cut(String(decoding: data.prefix(maxText * 4), as: UTF8.self)))
            return .success(.object(out))
        }
        return .failure(.init(message: "Plex reads text, PDFs and pictures, not \(url.pathExtension) files."))
    }

    private static func cut(_ text: String) -> String {
        text.count > maxText ? String(text.prefix(maxText)) + "\n…(cut)" : text
    }

    /// Scaled to fit `maxImageSide`, as JPEG.
    private static func jpeg(_ image: NSImage) -> Data? {
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let scale = min(1, maxImageSide / CGFloat(max(cg.width, cg.height)))
        let w = Int(CGFloat(cg.width) * scale), h = Int(CGFloat(cg.height) * scale)
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.setFillColor(.white)
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.interpolationQuality = .high
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let scaled = ctx.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: scaled).representation(using: .jpeg, properties: [.compressionFactor: 0.82])
    }
}
