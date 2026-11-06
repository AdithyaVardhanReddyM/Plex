import AppKit
import Foundation
import Observation

/// The conversation with the brain: talk-key audio up, voice and transcripts down,
/// the Mac tools the brain asks for, and the background tasks it runs. The island
/// draws itself from this.
@MainActor
@Observable
final class AgentSession {
    enum Connection {
        case offline, connecting, online

        var label: String {
            switch self {
            case .offline: "Plex is offline"
            case .connecting: "Connecting…"
            case .online: "Plex is ready"
            }
        }
    }

    enum Phase { case idle, listening, thinking, speaking }

    enum Role { case user, agent }

    struct Turn: Identifiable {
        let id = UUID()
        let role: Role
        var text: String
        var done: Bool
    }

    struct Activity: Identifiable {
        let id = UUID()
        let kind: String
        let label: String
        let detail: String?
    }

    /// A quiet line under the notch: a routine that ran on its own.
    struct Pill: Identifiable, Equatable {
        let id: String
        let symbol: String
        let text: String
        /// Money moved: the symbol is green.
        var moved = false
    }

    private(set) var connection: Connection = .offline
    private(set) var phase: Phase = .idle
    private(set) var turns: [Turn] = []
    /// What the agent did for the current request (tool calls).
    private(set) var activities: [Activity] = []
    /// Mic loudness 0…1 while listening, for the waveform.
    private(set) var micLevel: Float = 0
    private(set) var lastError: String?
    /// Background tasks, newest first (the brain's `task` frames).
    private(set) var tasks: [TaskItem] = []
    /// Money that just moved: the receipt card slides in for a few seconds.
    private(set) var receipt: ReceiptItem?
    /// A routine ran on its own: a pill under the notch for a few seconds.
    private(set) var pill: Pill?
    /// A file dropped on the notch, waiting for what the user wants done with it.
    private(set) var droppedFile: URL?
    /// The island is open to show something (a receipt, a dropped file), not because it's hovered.
    private(set) var presenting = false
    /// Pending asks (Needs you), for the notch badge and the menu bar.
    private(set) var asksCount = 0
    /// Pause all agent spending (users:setPaused in Convex).
    private(set) var paused = false

    /// The task that needs an answer or a yes, if any: the island opens for it.
    var taskNeedingYou: TaskItem? { tasks.first { $0.needsYou } }
    /// The one working in the foreground (a routine's run stays quiet).
    var runningTask: TaskItem? { tasks.first { $0.isRunning && !$0.isQuiet } }
    /// Tasks the island lists (quiet routine runs only while they need the user).
    var visibleTasks: [TaskItem] { tasks.filter { !$0.isQuiet } }

    /// The agent's words for the current reply, for the compact island's caption.
    var caption: String? {
        guard let last = turns.last, last.role == .agent else { return nil }
        return last.text
    }

    private let brain = BrainClient()
    private let mic = MicCapture()
    private let voice = VoicePlayer()
    private let tools = LocalTools()
    private var receiptTimer: Task<Void, Never>?
    private var pillTimer: Task<Void, Never>?
    private var presentTimer: Task<Void, Never>?
    private var folderWatcher: FolderWatchers?
    private var asksLoop: Task<Void, Never>?
    private var lastWake = Date.distantPast
    /// Receipts already shown, so a task frame repeating its receipt doesn't show it again.
    private var shownReceipts: Set<String> = []
    /// Routine runs whose end has been announced.
    private var announcedRuns: Set<String> = []

    private enum Talk { case off, pending, streaming }
    private var talk: Talk = .off
    /// Audio from the first moments of a press, sent once the press counts as a hold.
    private var heldBack: [Data] = []
    private var holdTimer: Task<Void, Never>?
    private var thinkingTimeout: Task<Void, Never>?
    /// Mic chunks come from an audio thread; this stream keeps them in order.
    private var micItems: AsyncStream<MicItem>.Continuation?

    private enum MicItem: Sendable { case chunk(Data, Float), end }

    /// A press shorter than this is a tap, not talk.
    private static let holdThreshold: Duration = .milliseconds(180)
    private static let offlineMessage = "Plex can't reach its brain. Is the agent server running?"

    init() {
        brain.onState = { [weak self] state in self?.brainStateChanged(state) }
        brain.onEvent = { [weak self] event in self?.handle(event) }
        brain.onAudio = { [weak self] data in self?.play(data) }
        brain.hello = {
            [
                "type": "hello",
                "user_id": .string(BrainSettings.userID),
                "timezone": .string(TimeZone.current.identifier),
                "name": .string(BrainSettings.userName),
            ]
        }
        voice.onIdle = { [weak self] in
            Task { @MainActor in self?.voiceFinished() }
        }
        watchWake()
    }

    // MARK: Connection

    func connect() {
        brain.connect(url: BrainSettings.url, token: BrainSettings.token)
        if asksLoop == nil {
            // The brain says when asks change; this catches ones answered elsewhere while it was away.
            asksLoop = Task { [weak self] in
                while !Task.isCancelled {
                    await self?.refreshAsks()
                    try? await Task.sleep(for: .seconds(60))
                }
            }
        }
    }

    func reconnect() {
        brain.disconnect()
        connect()
    }

    private func brainStateChanged(_ state: BrainClient.State) {
        switch state {
        case .offline: connection = .offline
        case .connecting: connection = .connecting
        case .online:
            connection = .online
            // After setup, so the Downloads prompt doesn't land in the middle of onboarding.
            if folderWatcher == nil, OnboardingWindow.isDone {
                folderWatcher = FolderWatchers { [weak self] url in self?.folderEvent(url) }
                folderWatcher?.start()
            }
        }
        if state == .offline, phase != .idle {
            stopEverything()
        }
    }

    /// The Mac woke or its screens came back: the brain's scheduler catches up on missed routines.
    private func watchWake() {
        let center = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didWakeNotification, NSWorkspace.screensDidWakeNotification] {
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.woke() }
            }
        }
    }

    private func woke() {
        // Waking sends both notifications; one frame is enough.
        guard Date().timeIntervalSince(lastWake) > 10 else { return }
        lastWake = Date()
        brain.send(["type": "wake"])
        Task { await refreshAsks() }
    }

    private func folderEvent(_ url: URL) {
        brain.send(["type": "folder_event", "path": .string(url.deletingLastPathComponent().path),
                    "file": .string(url.path)])
    }

    // MARK: Talking (fn + control)

    func startTalking() {
        guard talk == .off else { return }
        voice.stop()
        lastError = nil
        guard connection == .online else {
            lastError = Self.offlineMessage
            return
        }
        let (stream, continuation) = AsyncStream<MicItem>.makeStream()
        micItems = continuation
        do {
            try mic.start { data, level in continuation.yield(.chunk(data, level)) }
        } catch {
            lastError = "No microphone is available."
            micItems = nil
            return
        }
        talk = .pending
        heldBack = []
        phase = .listening
        Task { await pumpMic(stream) }

        holdTimer = Task {
            try? await Task.sleep(for: Self.holdThreshold)
            guard !Task.isCancelled, talk == .pending else { return }
            activities = []
            brain.send(["type": "talk_start"])
            heldBack.forEach { brain.send(audio: $0) }
            heldBack = []
            talk = .streaming
        }
    }

    func stopTalking() {
        guard talk != .off else { return }
        holdTimer?.cancel()
        mic.stop()
        if talk == .pending {
            // Too short to be speech: drop it.
            talk = .off
            micItems?.finish()
            micItems = nil
            heldBack = []
            phase = .idle
            return
        }
        micItems?.yield(.end)
        micItems?.finish()
        micItems = nil
    }

    /// Another key was pressed with the talk keys: it was a shortcut, not talk. A press still
    /// under the hold threshold is dropped; audio already sent can't be taken back, so it ends.
    func cancelTalking() {
        stopTalking()
    }

    private func pumpMic(_ stream: AsyncStream<MicItem>) async {
        for await item in stream {
            switch item {
            case .chunk(let data, let level):
                micLevel = min(1, level * 6)
                switch talk {
                case .pending: heldBack.append(data)
                case .streaming: brain.send(audio: data)
                case .off: break
                }
            case .end:
                if talk == .streaming {
                    brain.send(["type": "talk_end"])
                    beginThinking()
                }
                talk = .off
                micLevel = 0
            }
        }
    }

    // MARK: Typing

    func send(text: String) {
        var text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let file = droppedFile {
            text = "[Dropped file: \(file.path)] " + (text.isEmpty ? "What should I do with this?" : text)
        }
        guard !text.isEmpty else { return }
        guard connection == .online else {
            lastError = Self.offlineMessage
            return
        }
        voice.stop()
        lastError = nil
        activities = []
        turns.append(Turn(role: .user, text: droppedFile.map { "\($0.lastPathComponent): " + Self.stripDrop(text) } ?? text, done: true))
        droppedFile = nil
        brain.send(["type": "text", "text": .string(text)])
        beginThinking()
    }

    private static func stripDrop(_ text: String) -> String {
        guard let end = text.range(of: "] ") else { return text }
        return String(text[end.upperBound...])
    }

    // MARK: Dropped files

    /// A file dropped on the notch: open the island on it, with the file as a chip by the field.
    func drop(_ url: URL) {
        droppedFile = url
        present(for: .seconds(60))
    }

    func clearDrop() {
        droppedFile = nil
    }

    func clearError() {
        lastError = nil
    }

    func reset() {
        stopEverything()
        turns = []
        activities = []
        lastError = nil
        droppedFile = nil
        tasks.removeAll { $0.isOver }
        brain.send(["type": "reset"])
    }

    // MARK: Tasks

    /// The island's buttons on a task that wants a yes or no. `always` (a money approval's
    /// Always) also lets this payee through up to this amount from now on.
    func confirm(_ task: TaskItem, approved: Bool, always: Bool = false) {
        var frame: [String: JSONValue] = ["type": "task_confirm", "id": .string(task.id), "approved": .bool(approved)]
        if always { frame["always"] = true }
        brain.send(.object(frame))
    }

    /// A typed answer (or a picked choice) to a task's question.
    func answer(_ task: TaskItem, text: String) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        brain.send(["type": "task_reply", "id": .string(task.id), "text": .string(text)])
    }

    /// The takeover card's "I've done it".
    func continueTask(_ task: TaskItem) {
        brain.send(["type": "task_continue", "id": .string(task.id)])
    }

    func cancel(_ task: TaskItem) {
        brain.send(["type": "task_cancel", "id": .string(task.id)])
    }

    /// An ask answered in the notch that has no live task (a routine's ask after a restart).
    func answerAsk(_ askId: String, approved: Bool? = nil, always: Bool? = nil, text: String? = nil) {
        var frame: [String: JSONValue] = ["type": "ask_answer", "ask_id": .string(askId)]
        if let approved { frame["approved"] = .bool(approved) }
        if let always { frame["always"] = .bool(always) }
        if let text { frame["text"] = .string(text) }
        brain.send(.object(frame))
    }

    func dismiss(_ task: TaskItem) {
        tasks.removeAll { $0.id == task.id }
    }

    // MARK: Presenting

    /// Open the island without the pointer, for a while (the pointer holds it open).
    private func present(for duration: Duration) {
        presenting = true
        presentTimer?.cancel()
        presentTimer = Task {
            try? await Task.sleep(for: duration)
            guard !Task.isCancelled else { return }
            presenting = false
        }
    }

    /// The pointer opened the island: keep what's on show while it's read.
    func hold() {
        presentTimer?.cancel()
        receiptTimer?.cancel()
        pillTimer?.cancel()
    }

    /// The island closed: what the user has seen is done.
    func islandClosed() {
        presenting = false
        receipt = nil
        if droppedFile != nil, turns.isEmpty { droppedFile = nil }
    }

    func dismissReceipt() {
        receiptTimer?.cancel()
        receipt = nil
    }

    func show(_ receipt: ReceiptItem) {
        shownReceipts.insert(receipt.id)
        self.receipt = receipt
        receiptTimer?.cancel()
        receiptTimer = Task {
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled, self.receipt?.id == receipt.id else { return }
            self.receipt = nil
        }
    }

    func show(_ pill: Pill) {
        self.pill = pill
        pillTimer?.cancel()
        pillTimer = Task {
            try? await Task.sleep(for: .seconds(8))
            guard !Task.isCancelled, self.pill?.id == pill.id else { return }
            self.pill = nil
        }
    }

    /// A routine's run ended: say so in a pill, not by opening the island.
    private func announce(_ task: TaskItem) {
        guard let routine = task.routine, task.isOver, !announcedRuns.contains(task.id) else { return }
        announcedRuns.insert(task.id)
        let text: String
        var moved = false
        switch task.status {
        case "done":
            if let receipt = task.receipt {
                moved = !receipt.isRefund
                text = "\(routine.name) ran · \(Self.verb(receipt)) \(Money.format(receipt.amountCents, whole: true))"
            } else {
                text = "\(routine.name) ran" + (task.say.map { " · \($0)" } ?? "")
            }
        case "failed": text = "\(routine.name) didn't finish"
        default: text = "\(routine.name) stopped"
        }
        show(Pill(id: task.id, symbol: task.status == "done" ? "checkmark.circle.fill" : "exclamationmark.circle.fill",
                  text: text, moved: moved))
    }

    static func verb(_ receipt: ReceiptItem) -> String {
        // The brain sends the receipt's kind: subscription is a cancellation, invoice a request.
        switch receipt.kind ?? "" {
        case "request", "invoice": "invoiced"
        case "refund": "refunded"
        case "cancel", "subscription": "cancelled"
        default: receipt.isRefund ? "refunded" : "paid"
        }
    }

    // MARK: Needs you and spending

    /// The pending asks count and the pause switch, from Convex (quietly nothing when it's down).
    func refreshAsks() async {
        if let pending = try? await NotchBackend.query("asks:pending"), case .array(let asks) = pending {
            asksCount = asks.count
        }
        if let today = try? await NotchBackend.query("agent:today"), let p = today["user"]?["paused"]?.bool {
            paused = p
        }
    }

    /// Pause all agent spending (or resume it). Convex enforces it; this only flips the switch.
    func setPaused(_ on: Bool) {
        let before = paused
        paused = on
        Task {
            do {
                _ = try await NotchBackend.mutation("users:setPaused", ["paused": .bool(on)])
            } catch {
                paused = before
                lastError = "Couldn't \(on ? "pause" : "resume") spending: \(error.localizedDescription)"
            }
        }
    }

    /// A Mac tool run from the app itself.
    func runTool(_ name: String, args: JSONValue) {
        Task { _ = await tools.run(name, args: args) }
    }

    // MARK: From the brain

    private func handle(_ event: BrainEvent) {
        switch event.type {
        case .transcript:
            guard let text = event.text else { return }
            transcript(role: event.role == "user" ? .user : .agent, text: text, partial: event.partial ?? false)
        case .activity:
            // A task's steps show on its card; only the talker's own lookups list here.
            guard event.taskId == nil else { return }
            activities.append(Activity(kind: event.kind ?? "tool", label: event.label ?? "", detail: event.detail))
        case .task:
            guard let task = event.task else { return }
            update(task)
        case .receipt:
            guard let receipt = event.receipt, !shownReceipts.contains(receipt.id) else { return }
            show(receipt)
        case .asksChanged:
            // Needs you refreshes (`.plexAsksChanged` is declared with ConvexClient in Sources/Data).
            NotificationCenter.default.post(name: .plexAsksChanged, object: nil)
            Task { await refreshAsks() }
        case .operatorStatus:
            let id = event.taskId
            AgentCursor.shared.setOperating(event.active ?? false) { [weak self] in
                // esc on the overlay: stop the task that has the Mac.
                if let id { self?.brain.send(["type": "task_cancel", "id": .string(id)]) }
            }
        case .toolCall:
            guard let id = event.id, let name = event.name else { return }
            Task {
                let outcome = await tools.run(name, args: event.args)
                var reply: [String: JSONValue] = ["type": "tool_result", "id": .string(id)]
                switch outcome {
                case .success(let result): reply["result"] = result
                case .failure(let error): reply["error"] = .string(error.message)
                }
                brain.send(.object(reply))
            }
        case .interrupted:
            voice.stop()
        case .turnComplete:
            if phase == .speaking, !voice.isPlaying { phase = .idle }
        case .error:
            lastError = event.message
            if phase == .thinking { phase = .idle }
        case .insights:
            // Plex built a page of charts for a question you asked: show it.
            IslandActions.openMainWindow(.insights)
        case .ready, .unknown:
            break
        }
    }

    private func update(_ task: TaskItem) {
        if let i = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[i] = task
        } else {
            tasks.insert(task, at: 0)
        }
        tasks = Array(tasks.prefix(8))
        if task.isQuiet {
            announce(task)
        } else if let receipt = task.receipt, !shownReceipts.contains(receipt.id) {
            show(receipt)
        }
    }

    private func transcript(role: Role, text: String, partial: Bool) {
        if let i = turns.indices.last, turns[i].role == role, !turns[i].done {
            // Partials are pieces to append; the final one is the whole text.
            turns[i].text = partial ? turns[i].text + text : text
            turns[i].done = !partial
        } else {
            turns.append(Turn(role: role, text: text, done: !partial))
        }
        if role == .agent, phase == .thinking { phase = .speaking }
    }

    private func play(_ data: Data) {
        thinkingTimeout?.cancel()
        if phase == .thinking || phase == .idle { phase = .speaking }
        voice.enqueue(pcm16: data)
    }

    private func voiceFinished() {
        if phase == .speaking { phase = .idle }
    }

    private func beginThinking() {
        phase = .thinking
        thinkingTimeout?.cancel()
        thinkingTimeout = Task {
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled, phase == .thinking else { return }
            phase = .idle
            lastError = "No answer came back. Try again?"
        }
    }

    private func stopEverything() {
        holdTimer?.cancel()
        thinkingTimeout?.cancel()
        mic.stop()
        micItems?.finish()
        micItems = nil
        talk = .off
        heldBack = []
        micLevel = 0
        voice.stop()
        phase = .idle
    }

    // MARK: Samples (debug launch arguments)

    #if DEBUG
    func loadSampleConversation() {
        turns = [
            Turn(role: .user, text: "Pay the Northwave bill, it came in this morning", done: true),
            Turn(role: .agent, text: "It's $84.20, a bit over your usual $79. Your Utilities pot asks before anything over $50, so it's waiting for your OK.", done: true),
        ]
        activities = [
            Activity(kind: "money", label: "Checked the Utilities pot", detail: "$412 left this month"),
            Activity(kind: "mail", label: "Found the bill in Gmail", detail: "Northwave Internet"),
        ]
        phase = .speaking
    }

    /// `-sampleTasks`: an approval, a takeover, a question and a task at work.
    func loadSampleTasks() {
        tasks = SampleViews.tasks
    }

    /// `-sampleViews approval|takeover|question|receipt|routine|drop|note|timeline|file`.
    func loadSampleView(_ type: String) {
        switch type {
        case "receipt":
            show(SampleViews.receipt)
            presenting = true
        case "routine":
            show(SampleViews.routinePill)
        case "drop":
            droppedFile = URL(fileURLWithPath: "/Users/adi/Downloads/Pacific Power bill October.pdf")
            presenting = true
        default:
            if let task = SampleViews.task(type) { tasks = [task] }
        }
    }

    /// Hold the sample receipt and pill on screen (their timers would clear them mid-render).
    func pinSamples(receipt: ReceiptItem?, pill: Pill?) {
        receiptTimer?.cancel()
        pillTimer?.cancel()
        self.receipt = receipt
        self.pill = pill
    }

    func debugSetTasks(_ tasks: [TaskItem]) {
        self.tasks = tasks
    }

    func debugDrop(_ url: URL) {
        droppedFile = url
    }

    /// At rest, with `asks` waiting (the notch badge), and optionally without the conversation.
    func debugIdle(asks: Int, keepConversation: Bool = true) {
        phase = .idle
        asksCount = asks
        if !keepConversation {
            turns = []
            activities = []
        }
    }

    func clearSamples() {
        tasks = []
        receipt = nil
        pill = nil
        droppedFile = nil
        presenting = false
    }

    /// Fetch every picture the sample cards draw, so -renderIsland shows them.
    func prepareForRender() async {
        let urls = tasks.flatMap(\.cards).compactMap(\.image)
        for url in urls { _ = await ImageCache.load(url) }
    }

    func ask(_ question: String, whenOnline: Bool) {
        Task {
            while connection != .online { try? await Task.sleep(for: .milliseconds(200)) }
            send(text: question)
        }
    }
    #endif
}
