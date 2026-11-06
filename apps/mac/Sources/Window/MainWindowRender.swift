#if DEBUG
import AppKit
import SwiftUI

/// `-renderWindow <dir>`: opens the real main window and snapshots each section as drawn (lists,
/// text fields and all), at 1120×740, then a routine's detail and the New routine sheet.
@MainActor
enum MainWindowRender {
    static func write(agent: AgentSession, to dir: URL) async {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        MWLook.still = true
        let controller = MainWindowController.shared
        controller.show(agent: agent, section: .today)
        // show() creates the window a moment later, once Plex is a regular app.
        for _ in 0..<40 where controller.window == nil { try? await Task.sleep(for: .milliseconds(50)) }
        guard let window = controller.window else { return }
        let frame = window.frameRect(forContentRect: NSRect(origin: .zero, size: MainWindowController.size))
        window.setFrame(NSRect(x: 80, y: 80, width: frame.width, height: frame.height), display: true)
        let model = controller.model
        try? await Task.sleep(for: .seconds(2))

        for section in MainSection.allCases {
            model.go(section)
            try? await Task.sleep(for: .seconds(section == .connections ? 3.5 : 2.2))
            snapshot(window, to: dir.appendingPathComponent("window-\(section.rawValue).png"))
            // The rest of the page, scrolled to the bottom, for checking what's below the fold.
            if [.today, .money, .connections, .activity, .memory].contains(section), let scroll = mainScroll(in: window) {
                let doc = scroll.documentView?.bounds.height ?? 0
                let visible = scroll.contentView.bounds.height
                if doc > visible + 20 {
                    let y = scroll.documentView?.isFlipped == false ? 0 : doc - visible
                    scroll.contentView.scroll(to: NSPoint(x: 0, y: y))
                    scroll.reflectScrolledClipView(scroll.contentView)
                    try? await Task.sleep(for: .seconds(0.8))
                    snapshot(window, to: dir.appendingPathComponent("bottom-\(section.rawValue).png"))
                    scroll.contentView.scroll(to: .zero)
                }
            }
        }

        // A routine's detail, with its first run open.
        let routines: [RoutineDoc] = (try? await ConvexClient.shared.query("routines:list")) ?? []
        if let routine = routines.first(where: { $0.spec.movesMoney }) ?? routines.first {
            model.section = .routines
            model.openRoutineID = routine.id
            try? await Task.sleep(for: .seconds(2.2))
            snapshot(window, to: dir.appendingPathComponent("window-routine-detail.png"))

            // The New routine sheet: empty, then reviewing what Plex understood.
            model.newRoutine()
            try? await Task.sleep(for: .seconds(1.5))
            snapshot(window, to: dir.appendingPathComponent("window-routine-new.png"))
            model.showingNewRoutine = false
            try? await Task.sleep(for: .seconds(1))

            model.newRoutine(prompt: routine.prompt, draft: RoutineDraft(routine: routine,
                questions: ["Which pot should rent come from?"]))
            try? await Task.sleep(for: .seconds(1.5))
            snapshot(window, to: dir.appendingPathComponent("window-routine-review.png"))
            model.showingNewRoutine = false
            try? await Task.sleep(for: .milliseconds(600))
        }
        window.close()
    }

    /// The window as drawn, with an attached sheet composited where it sits.
    static func snapshot(_ window: NSWindow, to url: URL) {
        guard let base = bitmap(of: window) else { return }
        let size = NSSize(width: base.pixelsWide, height: base.pixelsHigh)
        let scale = CGFloat(base.pixelsWide) / window.frame.width
        let image = NSImage(size: size)
        image.lockFocus()
        base.draw(in: NSRect(origin: .zero, size: size))
        if let sheet = window.attachedSheet, let rep = bitmap(of: sheet) {
            // Dim the window behind, as macOS does, then the sheet.
            NSColor.black.withAlphaComponent(0.08).setFill()
            NSRect(origin: .zero, size: size).fill()
            let x = (sheet.frame.minX - window.frame.minX) * scale
            let y = (sheet.frame.minY - window.frame.minY) * scale
            let rect = NSRect(x: x, y: y, width: sheet.frame.width * scale, height: sheet.frame.height * scale)
            let shadow = NSShadow()
            shadow.shadowColor = NSColor.black.withAlphaComponent(0.22)
            shadow.shadowBlurRadius = 24 * scale
            shadow.shadowOffset = NSSize(width: 0, height: -8 * scale)
            NSGraphicsContext.saveGraphicsState()
            shadow.set()
            NSBezierPath(roundedRect: rect, xRadius: 12 * scale, yRadius: 12 * scale).fill()
            NSGraphicsContext.restoreGraphicsState()
            NSGraphicsContext.saveGraphicsState()
            NSBezierPath(roundedRect: rect, xRadius: 12 * scale, yRadius: 12 * scale).addClip()
            rep.draw(in: rect)
            NSGraphicsContext.restoreGraphicsState()
        }
        image.unlockFocus()
        guard let tiff = image.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: url)
    }

    /// The detail column's scroll view: the tallest document on screen.
    private static func mainScroll(in window: NSWindow) -> NSScrollView? {
        var found: [NSScrollView] = []
        func walk(_ view: NSView) {
            if let s = view as? NSScrollView { found.append(s) }
            view.subviews.forEach(walk)
        }
        if let root = window.contentView { walk(root) }
        return found.max { ($0.documentView?.bounds.height ?? 0) < ($1.documentView?.bounds.height ?? 0) }
    }

    private static func bitmap(of window: NSWindow) -> NSBitmapImageRep? {
        guard let view = window.contentView?.superview ?? window.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return nil }
        view.cacheDisplay(in: view.bounds, to: rep)
        return rep
    }
}
#endif
