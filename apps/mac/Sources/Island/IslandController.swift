import AppKit
import SwiftUI

/// Owns the island's panel: pins it over the notch, opens it while the pointer is over
/// the notch, and lets clicks through everywhere the island isn't drawn.
@MainActor
final class IslandController {
    let model: IslandModel
    private let panel: IslandPanel
    private var screen: NSScreen
    private var monitors: [Any] = []
    private var openTask: Task<Void, Never>?
    private var closeTask: Task<Void, Never>?
    private var lingerTask: Task<Void, Never>?
    private var lastPhase: AgentSession.Phase = .idle
    private var dragCount = NSPasteboard(name: .drag).changeCount

    /// The panel is fixed and larger than the island; the island draws at its top centre.
    private static let panelSize = CGSize(width: 720, height: 680)
    /// Hover this long before the island opens, so sweeping past it does nothing.
    private static let openDelay: Duration = .milliseconds(90)
    private static let closeDelay: Duration = .milliseconds(350)
    private static let lingerFor: Duration = .seconds(4)

    init(agent: AgentSession) {
        model = IslandModel(agent: agent)
        screen = Self.notchScreen()
        panel = IslandPanel(
            contentRect: NSRect(origin: .zero, size: Self.panelSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        let host = DropHostView(frame: NSRect(origin: .zero, size: Self.panelSize))
        host.embed(NSHostingView(rootView: IslandView(model: model)))
        panel.contentView = host
        host.onDrop = { [weak self] url in
            guard let self else { return }
            self.model.dropTargeted = false
            self.model.agent.drop(url)
            self.panel.makeKey()
            self.updateClickThrough()
        }
        host.onExit = { [weak self] in
            guard let self else { return }
            self.model.dropTargeted = false
            self.updateClickThrough()
        }
        layout()
        panel.orderFrontRegardless()

        installMonitors()
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.screen = Self.notchScreen()
                self.layout()
            }
        }
        watchAgent()
    }

    // MARK: Placement

    private static func notchScreen() -> NSScreen {
        NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.main ?? NSScreen.screens[0]
    }

    private func layout() {
        if screen.safeAreaInsets.top > 0, let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea {
            model.notch = CGSize(width: screen.frame.width - left.width - right.width, height: screen.safeAreaInsets.top)
            model.hasNotch = true
        } else {
            let menuBar = screen.frame.maxY - screen.visibleFrame.maxY
            model.notch = CGSize(width: 200, height: menuBar > 0 ? menuBar : 24)
            model.hasNotch = false
        }
        let f = screen.frame
        panel.setFrame(
            NSRect(x: f.midX - Self.panelSize.width / 2, y: f.maxY - Self.panelSize.height,
                   width: Self.panelSize.width, height: Self.panelSize.height),
            display: true
        )
    }

    /// Where the island is drawn for a mode, in screen coordinates.
    private func islandRect(_ mode: IslandModel.Mode) -> CGRect {
        let size = model.size(mode)
        let width = size.width + 2 * IslandModel.shoulder
        let f = screen.frame
        return CGRect(x: f.midX - width / 2, y: f.maxY - size.height, width: width, height: size.height)
    }

    /// The area that opens the island: the notch (a little wider), the pill or receipt, or the island while open.
    private func hotRect() -> CGRect {
        if model.mode == .open {
            return islandRect(.open).insetBy(dx: -6, dy: -6)
        }
        if model.mode == .pill || model.mode == .receipt {
            return islandRect(model.mode)
        }
        let f = screen.frame
        let height = max(model.notch.height, 6)
        return CGRect(x: f.midX - model.notch.width / 2 - 10, y: f.maxY - height,
                      width: model.notch.width + 20, height: height)
    }

    // MARK: Pointer and keys

    private func installMonitors() {
        let moves: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDragged, .rightMouseDragged]
        if let global = NSEvent.addGlobalMonitorForEvents(matching: moves, handler: { _ in
            MainActor.assumeIsolated { self.pointerMoved() }
        }) {
            monitors.append(global)
        }
        // A file dragged from Finder: note when the drag starts, so the notch can take it.
        if let downs = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp], handler: { event in
            MainActor.assumeIsolated { self.mouseButton(event.type == .leftMouseDown) }
        }) {
            monitors.append(downs)
        }
        if let local = NSEvent.addLocalMonitorForEvents(matching: moves, handler: { event in
            MainActor.assumeIsolated { self.pointerMoved() }
            return event
        }) {
            monitors.append(local)
        }
        // Escape closes the open island.
        if let keys = NSEvent.addLocalMonitorForEvents(matching: .keyDown, handler: { event in
            guard event.keyCode == 53 else { return event }
            MainActor.assumeIsolated { self.close() }
            return nil
        }) {
            monitors.append(keys)
        }
    }

    private func mouseButton(_ down: Bool) {
        if down {
            dragCount = NSPasteboard(name: .drag).changeCount
        } else if model.dropTargeted {
            // Released somewhere else (a drop on the island ends in DropHostView first).
            Task {
                try? await Task.sleep(for: .milliseconds(300))
                model.dropTargeted = false
                updateClickThrough()
            }
        }
    }

    /// A file drag has started since the button went down (the drag pasteboard changed).
    private var fileDragActive: Bool {
        guard NSEvent.pressedMouseButtons & 1 == 1 else { return false }
        let board = NSPasteboard(name: .drag)
        return board.changeCount != dragCount && board.canReadObject(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true])
    }

    private func pointerMoved() {
        let point = NSEvent.mouseLocation
        if fileDragActive {
            // Over the notch with a file: open the drop zone and take mouse events for the drop.
            let zone = islandRect(.drop).insetBy(dx: -20, dy: -10)
            let over = model.dropTargeted ? zone.contains(point) : hotRect().insetBy(dx: -30, dy: -8).contains(point)
            if over != model.dropTargeted {
                model.dropTargeted = over
            }
            panel.ignoresMouseEvents = !over
            return
        }
        if hotRect().contains(point) {
            closeTask?.cancel()
            closeTask = nil
            if !model.hovering, openTask == nil {
                openTask = Task {
                    try? await Task.sleep(for: Self.openDelay)
                    openTask = nil
                    guard !Task.isCancelled, hotRect().contains(NSEvent.mouseLocation) else { return }
                    model.hovering = true
                    model.agent.hold()
                    updateClickThrough()
                }
            }
        } else {
            openTask?.cancel()
            openTask = nil
            if model.hovering, closeTask == nil {
                closeTask = Task {
                    try? await Task.sleep(for: Self.closeDelay)
                    closeTask = nil
                    guard !Task.isCancelled else { return }
                    model.hovering = false
                    model.agent.islandClosed()
                    giveBackKeyFocus()
                    updateClickThrough()
                }
            }
        }
        updateClickThrough()
    }

    /// Clicks reach the island only while it's open (or taking a drop) and the pointer is on it.
    private func updateClickThrough() {
        if model.dropTargeted {
            if panel.ignoresMouseEvents { panel.ignoresMouseEvents = false }
            return
        }
        let onIsland = model.mode == .open && islandRect(.open).contains(NSEvent.mouseLocation)
        if panel.ignoresMouseEvents == onIsland { panel.ignoresMouseEvents = !onIsland }
    }

    private func close() {
        model.draft = ""
        model.hovering = false
        model.agent.islandClosed()
        giveBackKeyFocus()
        updateClickThrough()
    }

    /// Typing made the panel key; hand the keyboard back to the app underneath.
    private func giveBackKeyFocus() {
        guard panel.isKeyWindow, model.draft.isEmpty else { return }
        panel.orderOut(nil)
        panel.orderFrontRegardless()
    }

    // MARK: Agent

    /// After a reply (or an error) the caption stays up for a few seconds.
    private func watchAgent() {
        withObservationTracking {
            _ = model.agent.phase
            _ = model.agent.lastError
            _ = model.agent.presenting
            _ = model.agent.droppedFile
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.agentChanged()
                self?.watchAgent()
            }
        }
    }

    private func agentChanged() {
        // A card opened (or closed) without the pointer: clicks must reach it (or pass through).
        updateClickThrough()
        let phase = model.agent.phase
        defer { lastPhase = phase }
        let finished = phase == .idle && lastPhase != .idle && lastPhase != .listening
        guard finished || model.agent.lastError != nil else { return }
        model.lingering = true
        lingerTask?.cancel()
        lingerTask = Task {
            try? await Task.sleep(for: Self.lingerFor)
            guard !Task.isCancelled else { return }
            model.lingering = false
            model.agent.clearError()
        }
    }
}

#if DEBUG
extension IslandController {
    /// Renders each island mode, and each card on its own, to PNGs in `dir` (no window or screen
    /// access needed): island-<mode>.png with the current sample, and card-<name>.png.
    func renderPreviews(to dir: URL) {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        model.rendering = true
        defer { model.rendering = false }
        let agent = model.agent

        func write<V: View>(_ view: V, _ name: String) {
            let renderer = ImageRenderer(content: view)
            renderer.scale = 2
            if let image = renderer.nsImage, let tiff = image.tiffRepresentation,
               let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                try? png.write(to: dir.appendingPathComponent(name + ".png"))
            }
        }
        func island(_ mode: IslandModel.Mode, _ name: String) {
            model.preview = mode
            let height = model.size(mode).height + 40
            write(IslandView(model: model)
                .frame(width: Self.panelSize.width, height: height, alignment: .top)
                .background(Color(white: 0.84)), name)
        }

        // The open island with what's loaded (the approval and a running task by default).
        island(.open, "island-open")
        island(.captioned, "island-captioned")
        island(.compact, "island-compact")

        // Each card in the island it would open, one at a time.
        let tasks = agent.tasks
        agent.clearSamples()
        for (name, task) in [("approval", SampleViews.approval), ("takeover", SampleViews.takeover),
                             ("question", SampleViews.question)] {
            agent.debugSetTasks([task])
            island(.open, "island-\(name)")
        }
        agent.debugSetTasks([])
        agent.debugIdle(asks: 0)
        agent.pinSamples(receipt: SampleViews.receipt, pill: nil)
        island(.receipt, "island-receipt")
        agent.pinSamples(receipt: nil, pill: SampleViews.routinePill)
        agent.debugIdle(asks: 2)
        island(.pill, "island-pill")
        agent.debugIdle(asks: 0)
        agent.pinSamples(receipt: nil, pill: nil)
        island(.drop, "island-drop")
        agent.debugIdle(asks: 0, keepConversation: false)
        agent.debugDrop(URL(fileURLWithPath: "/Users/adi/Downloads/Pacific Power bill October.pdf"))
        island(.open, "island-file")
        agent.clearSamples()

        // The cards on their own, at the island's inner width.
        let cards = VStack(spacing: 8) {
            ReceiptCard(receipt: SampleViews.receipt)
            ForEach([SampleViews.approval, SampleViews.takeover, SampleViews.question, SampleViews.running, SampleViews.note]) {
                TaskCardView(task: $0, agent: agent)
            }
        }
        .padding(16)
        .frame(width: IslandModel.openWidth)
        .background(Color.black)
        .environment(\.colorScheme, .dark)
        .environment(\.islandRendering, true)
        write(cards, "cards")

        agent.debugSetTasks(tasks)
        model.preview = nil
    }
}
#endif

final class IslandPanel: NSPanel {
    override init(contentRect: NSRect, styleMask style: NSWindow.StyleMask, backing: NSWindow.BackingStoreType, defer flag: Bool) {
        super.init(contentRect: contentRect, styleMask: style, backing: backing, defer: flag)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.mainMenuWindow)) + 3)
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        ignoresMouseEvents = true
        becomesKeyOnlyIfNeeded = true
        hidesOnDeactivate = false
        isMovable = false
        // Always dark, whatever the app's theme: it has to match the notch.
        appearance = NSAppearance(named: .darkAqua)
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    /// Sit in the menu bar over the notch; don't let AppKit push the panel below it.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}
