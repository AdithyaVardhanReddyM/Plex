import Foundation

#if DEBUG
/// Plex's island cards as the brain sends them, for `-sampleTasks`, `-sampleViews <type>` and
/// `-renderIsland`, so each card can be looked at without a brain. All names are invented.
enum SampleViews {
    static let approval = TaskItem(
        id: "s-approval", title: "Pay the Northwave bill", status: "needs_confirmation",
        steps: ["Found the bill in Gmail", "Checked the Utilities pot"],
        approval: .init(amountCents: 8420, payee: "Northwave Internet", ruleText: "Ask before anything over $50",
                        potName: "Utilities", askId: "ask_sample_1")
    )

    static let takeover = TaskItem(
        id: "s-takeover", title: "Cancel Framewise", status: "needs_takeover",
        steps: ["Opened Framewise in the Plex browser"],
        takeover: .init(title: "Sign in to Northwave in the Plex browser",
                        detail: "Plex doesn't type passwords. Sign in once and it keeps the session for next time.",
                        kind: "login", url: "https://northwave.example/account")
    )

    static let question = TaskItem(
        id: "s-question", title: "Split the dinner receipt", status: "needs_input",
        steps: ["Read the receipt: $142.60 at Lantern & Pine"],
        question: "Split it evenly between you, Maya and Jonah, or by what each person ordered?",
        options: ["Evenly", "By what they ordered"]
    )

    static let running = TaskItem(
        id: "s-running", title: "Check subscriptions", status: "running",
        steps: ["Looked at when you last opened Framewise: 74 days ago"]
    )

    static let receipt = ReceiptItem(
        id: "r-sample", amountCents: 8420, payee: "Northwave Internet",
        why: "Pay the Northwave bill, it came in this morning",
        ruleText: "Utilities pot · approved by you", state: "sent", kind: "bill"
    )

    static let routinePill = AgentSession.Pill(
        id: "p-sample", symbol: "checkmark.circle.fill", text: "Rent check ran · paid $1,850", moved: true
    )

    static let note = TaskItem(
        id: "s-note", title: "Note to Jonah", status: "done", steps: ["Done"],
        say: "Here's a note you can send with the request.",
        views: [decode(#"{"type": "note", "key": "jonah", "title": "Note to Jonah", "text": "Hey Jonah, your share of Friday's dinner at Lantern & Pine is $47.53. I sent a PayPal request. Thanks!"}"#)].compactMap { $0 }
    )

    static let file = TaskItem(
        id: "s-file", title: "October spending", status: "done", steps: ["Done"],
        views: [decode(#"{"type": "file", "key": "oct", "title": "October spending.pdf", "path": "/tmp/October spending.pdf", "detail": "Every receipt, by pot"}"#)].compactMap { $0 }
    )

    static let tasks: [TaskItem] = [approval, running]

    static func task(_ type: String) -> TaskItem? {
        switch type {
        case "approval": approval
        case "takeover": takeover
        case "question": question
        case "running": running
        case "note": note
        case "file": file
        default: nil
        }
    }

    private static func decode(_ json: String) -> TaskView? {
        try? JSONDecoder().decode(TaskView.self, from: Data(json.utf8))
    }
}

#endif
