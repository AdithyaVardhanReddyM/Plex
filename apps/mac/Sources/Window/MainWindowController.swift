import AppKit
import Observation
import SwiftUI

enum MainSection: String, CaseIterable, Identifiable {
    case today, needsYou, routines, activity, money, insights, memory, connections, settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .needsYou: "Needs you"
        case .routines: "Routines"
        case .activity: "Activity"
        case .money: "Money"
        case .insights: "Insights"
        case .memory: "Memory"
        case .connections: "Connections"
        case .settings: "Settings"
        }
    }

    /// Its Lucide icon.
    var icon: String {
        switch self {
        case .today: "sun"
        case .needsYou: "hand"
        case .routines: "refresh-cw"
        case .activity: "activity"
        case .money: "wallet"
        case .insights: "chart-column"
        case .memory: "brain"
        case .connections: "plug"
        case .settings: "settings"
        }
    }
}

/// What the window shows, and the data every page shares (the Needs you count, the paused state).
@MainActor
@Observable
final class MainWindowModel {
    var section: MainSection = .today
    /// Routines › one routine.
    var openRoutineID: String?
    var showingNewRoutine = false
    /// What the New routine sheet opens with (a sentence said to the notch, or a render).
    var newRoutinePrompt = ""
    var newRoutineDraft: RoutineDraft?
    /// Set when the sheet edits an existing routine (`routines:save` with `routineId`).
    var editingRoutineID: String?

    /// A money approval you allowed, kept on screen as "Paying…" until its receipt shows up.
    struct Settling {
        let ask: AskDoc
        let since: Date
        let always: Bool
        var receipt: ReceiptDoc?
        var paidSeenAt: Date?
    }

    private(set) var settling: [String: Settling] = [:]

    let pending = LiveQuery<[AskDoc]>("asks:pending")
    let viewer = LiveQuery<ViewerDoc>("users:viewer")

    var needsYouCount: Int { pending.value?.count ?? 0 }
    var paused: Bool { viewer.value?.paused ?? false }

    func newRoutine(prompt: String = "", draft: RoutineDraft? = nil, editing routineID: String? = nil) {
        newRoutinePrompt = prompt
        newRoutineDraft = draft
        editingRoutineID = routineID
        section = .routines
        showingNewRoutine = true
    }

    func go(_ section: MainSection) {
        self.section = section
        if section != .routines { openRoutineID = nil }
    }

    /// `asks:answer`, answered from this window.
    func answer(_ ask: AskDoc, approved: Bool? = nil, always: Bool? = nil, text: String? = nil) async throws {
        var args: [String: JSONValue] = ["askId": .string(ask.id), "by": "window"]
        if let approved { args["approved"] = .bool(approved) }
        if let always { args["always"] = .bool(always) }
        if let text { args["text"] = .string(text) }
        try await ConvexClient.shared.mutation("asks:answer", args)
        if ask.isMoney, approved == true {
            settling[ask.id] = Settling(ask: ask, since: .now, always: always == true)
        }
        await pending.refresh()
    }

    /// Pending asks with the approvals still paying in front, so an Allow doesn't just vanish.
    func withSettling(_ asks: [AskDoc]) -> [AskDoc] {
        let ids = Set(asks.map(\.id))
        let paying = settling.values.filter { !ids.contains($0.ask.id) }.sorted { $0.since > $1.since }.map(\.ask)
        return paying + asks
    }

    /// While approvals are paying, look for their receipts; show "Paid" briefly, then let them go.
    func watchSettling() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(2.5))
            guard !settling.isEmpty else { continue }
            let receipts: [ReceiptDoc] = (try? await ConvexClient.shared.query("receipts:list")) ?? []
            let now = Date.now
            for (id, item) in settling {
                if item.receipt == nil, let match = receipts.first(where: { Self.matches($0, item) }) {
                    settling[id]?.receipt = match
                    settling[id]?.paidSeenAt = now
                    ConvexClient.shared.poke()
                } else if let seen = item.paidSeenAt, now.timeIntervalSince(seen) > 8 {
                    settling[id] = nil
                } else if item.receipt == nil, now.timeIntervalSince(item.since) > 120 {
                    settling[id] = nil
                }
            }
        }
    }

    private static func matches(_ r: ReceiptDoc, _ item: Settling) -> Bool {
        guard r.amountCents == item.ask.amountCents, r.occurredAt >= item.since.addingTimeInterval(-120) else { return false }
        guard let payee = item.ask.payee?.lowercased(), !payee.isEmpty else { return true }
        let label = r.payeeLabel.lowercased()
        return label.contains(payee) || payee.contains(label)
    }

    /// `users:setPaused`
    func setPaused(_ paused: Bool) async {
        _ = try? await ConvexClient.shared.mutation("users:setPaused", ["paused": .bool(paused)])
        await viewer.refresh()
    }
}

/// The main window: Today, Needs you, Routines, Activity, Money, Memory, Connections, Settings.
/// Opening it gives Plex a Dock icon; closing it hands the app back to the menu bar and the notch.
@MainActor
final class MainWindowController: NSObject, NSWindowDelegate {
    static let shared = MainWindowController()

    let model = MainWindowModel()
    private(set) var window: NSWindow?
    private weak var agent: AgentSession?

    static let size = NSSize(width: 1120, height: 740)

    func show(agent: AgentSession, section: MainSection = .today) {
        self.agent = agent
        model.go(section)
        ConvexClient.shared.windowVisible = true
        ConvexClient.shared.poke()
        if let window, window.isVisible, NSApp.activationPolicy() == .regular {
            NSApp.activate()
            window.makeKeyAndOrderFront(nil)
            return
        }
        // Plex runs as a menu bar (accessory) app, and macOS lets an accessory app's windows sit on
        // top of another app's full-screen Space. A window keeps how it behaves across Spaces from
        // the moment it's created, so become a regular app first, wait for that to take effect,
        // and only then create (or bring back) the window. macOS then treats it like any app window:
        // it opens on a desktop, and from a full-screen app it slides over to that desktop.
        guard !opening else { return }
        opening = true
        NSApp.setActivationPolicy(.regular)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            guard let self else { return }
            self.opening = false
            let window = self.window ?? self.makeWindow(agent: agent)
            self.window = window
            window.makeKeyAndOrderFront(nil)
            // Activating once the window exists makes macOS switch to its desktop (from a
            // full-screen app the screen slides over), as it does for any app.
            NSApp.activate()
        }
    }

    /// Between becoming a regular app and showing the window.
    private var opening = false

    private func makeWindow(agent: AgentSession) -> NSWindow {
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: Self.size),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false
        )
        window.title = "Plex"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unified
        window.appearance = NSAppearance(named: .aqua)
        window.minSize = NSSize(width: 900, height: 600)
        window.isReleasedWhenClosed = false
        // A normal document-style window: it lives on one desktop, can go full screen itself, and
        // never rides along onto other apps' full-screen Spaces (unlike the island and cursor panels).
        window.collectionBehavior = [.managed, .participatesInCycle, .fullScreenPrimary]
        window.setFrameAutosaveName("PlexMainWindow")
        window.backgroundColor = NSColor(Plex.canvas)
        window.delegate = self

        let host = NSHostingController(rootView: MainView(model: model, agent: agent))
        // The window keeps its own size; SwiftUI's ideal height (a tall scroll view) must not grow it.
        host.sizingOptions = []
        window.contentViewController = host
        window.minSize = NSSize(width: 900, height: 600)
        window.setContentSize(Self.size)
        if !window.setFrameUsingName("PlexMainWindow") { window.center() }
        return window
    }

    // MARK: NSWindowDelegate

    func windowWillClose(_ notification: Notification) {
        ConvexClient.shared.windowVisible = false
        NSApp.setActivationPolicy(.accessory)
    }

    func windowDidChangeOcclusionState(_ notification: Notification) {
        guard let window else { return }
        let visible = window.occlusionState.contains(.visible)
        ConvexClient.shared.windowVisible = visible
        if visible { ConvexClient.shared.poke() }
    }
}
