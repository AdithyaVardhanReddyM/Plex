import AppKit
import Observation

/// What the island shows and how big it is.
///
/// - closed: exactly the hardware notch, so it's invisible.
/// - compact: the notch with ears (the wordmark, and a live status), while listening.
/// - captioned: compact plus a line of what the agent is doing or saying, or what a
///   background task is up to.
/// - pill: compact plus a quiet line when a routine ran on its own ("Rent check ran · paid
///   $1,850"); hovering it opens the island.
/// - receipt: money just moved; the receipt card hangs under the notch for a few seconds.
/// - drop: a file is being dragged over the notch.
/// - open: the full panel (tasks, conversation, a text field) while hovered, whenever a task
///   needs an answer, a yes or a hand (its buttons must be clickable), and for a dropped file.
@MainActor
@Observable
final class IslandModel {
    enum Mode: String, Equatable { case closed, compact, captioned, pill, receipt, drop, open }

    static let shoulder: CGFloat = 6
    static let ear: CGFloat = 44
    static let captionWidth: CGFloat = 400
    static let receiptWidth: CGFloat = 440
    static let openWidth: CGFloat = 500
    static let openHeight: CGFloat = 340
    /// Nothing said yet: the hint and the field (and a dropped file's chip).
    static let openHeightEmpty: CGFloat = 230
    static let openHeightWithTasks: CGFloat = 500
    /// Room for a rich card or a receipt above the conversation.
    static let openHeightWithCards: CGFloat = 600

    let agent: AgentSession
    var notch = CGSize(width: 185, height: 32)
    var hasNotch = true
    var hovering = false
    var draft = ""
    /// A file drag is over the notch.
    var dropTargeted = false
    /// Keeps the last words (or an error) up for a moment after the agent goes quiet.
    var lingering = false
    /// Debug builds: pins a mode for screenshots (`-islandPreview open`).
    var preview: Mode?
    /// Drawing for -renderIsland: ImageRenderer leaves ScrollViews blank, so lay out plainly.
    var rendering = false

    init(agent: AgentSession) {
        self.agent = agent
    }

    var mode: Mode {
        if let preview { return preview }
        if dropTargeted { return .drop }
        if hovering || !draft.isEmpty || agent.taskNeedingYou != nil || agent.presenting { return .open }
        if agent.receipt != nil { return .receipt }
        if agent.pill != nil, agent.phase == .idle { return .pill }
        switch agent.phase {
        case .listening: return .compact
        case .thinking: return agent.activities.isEmpty ? .compact : .captioned
        case .speaking: return .captioned
        case .idle:
            if lingering && agent.caption != nil { return .captioned }
            return agent.runningTask != nil || agent.lastError != nil ? .captioned : .closed
        }
    }

    var captionText: String? {
        if let error = agent.lastError { return error }
        switch agent.phase {
        case .thinking:
            return agent.activities.last.map { [$0.label, $0.detail].compactMap(\.self).joined(separator: ", ") }
        case .idle where !lingering:
            guard let task = agent.runningTask else { return agent.caption }
            return task.steps.last.map { "\(task.title): \($0)" } ?? task.title
        default:
            return agent.caption
        }
    }

    /// The island's body size (the shoulders add `shoulder` on each side).
    func size(_ mode: Mode) -> CGSize {
        let barHeight = max(notch.height, 26)
        let withEars = notch.width + 2 * Self.ear
        switch mode {
        case .closed: return CGSize(width: notch.width, height: hasNotch ? notch.height : 0)
        case .compact: return CGSize(width: withEars, height: barHeight)
        case .captioned: return CGSize(width: max(withEars, Self.captionWidth), height: barHeight + 50)
        case .pill: return CGSize(width: max(withEars, Self.captionWidth), height: barHeight + 34)
        case .drop: return CGSize(width: max(withEars, Self.captionWidth), height: barHeight + 80)
        case .receipt: return CGSize(width: max(withEars, Self.receiptWidth), height: barHeight + receiptHeight + 12)
        case .open:
            let empty = agent.turns.isEmpty && agent.visibleTasks.isEmpty && !hasCards
            let height = empty ? Self.openHeightEmpty
                : hasCards ? Self.openHeightWithCards : agent.visibleTasks.isEmpty ? Self.openHeight : Self.openHeightWithTasks
            return CGSize(width: max(withEars + 80, Self.openWidth), height: height)
        }
    }

    /// The receipt card's height (ReceiptCard): a line more for the user's words, and for the rule.
    private var receiptHeight: CGFloat {
        guard let receipt = agent.receipt else { return 126 }
        var height: CGFloat = 24 + 20 + 6 + 32
        if receipt.why?.isEmpty == false { height += 6 + 17 }
        if receipt.ruleText?.isEmpty == false { height += 6 + 15 }
        return height
    }

    /// A receipt or a task with a rich card is on show, so the open island grows.
    var hasCards: Bool {
        agent.receipt != nil || agent.visibleTasks.prefix(2).contains { !$0.views.isEmpty || !$0.cards.isEmpty }
            || agent.visibleTasks.filter(\.needsYou).count > 1
    }
}
