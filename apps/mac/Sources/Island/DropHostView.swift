import AppKit

/// The island panel's content view: hosts the SwiftUI island and takes files dropped on the
/// notch (PDFs and pictures). The controller lets mouse events through to it only while a file
/// drag is over the notch.
final class DropHostView: NSView {
    static let accepted = ["pdf", "png", "jpg", "jpeg", "heic", "gif", "tiff", "webp"]

    var onDrop: ((URL) -> Void)?
    var onExit: (() -> Void)?

    override init(frame: NSRect) {
        super.init(frame: frame)
        registerForDraggedTypes([.fileURL])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func embed(_ view: NSView) {
        view.frame = bounds
        view.autoresizingMask = [.width, .height]
        addSubview(view)
    }

    private func file(_ info: NSDraggingInfo) -> URL? {
        let urls = info.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL]
        return urls?.first { Self.accepted.contains($0.pathExtension.lowercased()) }
    }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        file(sender) == nil ? [] : .copy
    }

    override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
        file(sender) == nil ? [] : .copy
    }

    override func draggingExited(_ sender: NSDraggingInfo?) {
        onExit?()
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        guard let url = file(sender) else { return false }
        onDrop?(url)
        return true
    }
}
