import AppKit
import SwiftUI

/// The open island's task cards: the ones that need the user first, then the one
/// running, then the latest finished. Two at most, so the conversation keeps room.
/// A routine's quiet run shows here only while it needs the user.
struct TasksArea: View {
    let agent: AgentSession

    private var shown: [TaskItem] {
        let tasks = agent.visibleTasks
        let ordered = tasks.filter(\.needsYou) + tasks.filter(\.isRunning) + tasks.filter(\.isOver)
        return Array(ordered.prefix(2))
    }

    var body: some View {
        if !shown.isEmpty {
            VStack(spacing: 8) {
                ForEach(shown) { TaskCardView(task: $0, agent: agent) }
            }
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }
}

struct TaskCardView: View {
    let task: TaskItem
    let agent: AgentSession

    var body: some View {
        if task.status == "needs_confirmation", let approval = task.approval {
            ApprovalCard(task: task, approval: approval, agent: agent)
        } else if task.status == "needs_takeover" {
            TakeoverCard(task: task, agent: agent)
        } else if task.status == "needs_input" {
            QuestionCard(task: task, agent: agent)
        } else {
            ProgressCard(task: task, agent: agent)
        }
    }
}

/// The header every task card shares: a status mark, the title, and Stop or dismiss.
private struct CardTitle<Mark: View>: View {
    let title: String
    var trailing: String?
    @ViewBuilder var mark: Mark

    var body: some View {
        HStack(spacing: 8) {
            mark.frame(width: 22, height: 22)
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(IslandStyle.text)
                .lineLimit(1)
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(IslandStyle.text3)
            }
        }
    }
}

// MARK: Money approval

/// The policy engine asked before this payment: the amount, who to, from which pot, and the
/// rule that asked. Allow is the only green button in the island.
struct ApprovalCard: View {
    let task: TaskItem
    let approval: TaskItem.Approval
    let agent: AgentSession

    var body: some View {
        IslandCard(highlighted: true, strip: IslandStyle.heldStrip) {
            CardTitle(title: task.title, trailing: task.routine?.name ?? "Needs your OK") {
                PlexIconTile(symbol: "wallet", tint: .glass, size: 22)
            }
        } content: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                AmountText(cents: approval.amountCents, size: 32, style: AnyShapeStyle(IslandGlow.money))
                Spacer(minLength: 8)
                if let pot = approval.potName {
                    PlexLabel(pot, icon: "inbox")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(IslandStyle.accent)
                        .padding(.horizontal, 9)
                        .frame(height: 24)
                        .background(Capsule().fill(IslandStyle.waiting))
                }
            }
            Text("To \(approval.payee)")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(IslandStyle.text)
                .padding(.top, -4)
            if let rule = approval.ruleText, !rule.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    PlexIcon(symbol: "shield", size: 11, color: nil)
                    Text("Asked because: \(rule)")
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.system(size: 12))
                .foregroundStyle(IslandStyle.text2)
            }
            HStack(spacing: 8) {
                Button("Always") { agent.confirm(task, approved: true, always: true) }
                    .buttonStyle(IslandButtonStyle(.ghost))
                    .help("Allow, and don't ask again for \(approval.payee) up to \(Money.format(approval.amountCents))")
                Spacer()
                Button("Deny") { agent.confirm(task, approved: false) }
                    .buttonStyle(IslandButtonStyle(.secondary))
                Button("Allow") { agent.confirm(task, approved: true) }
                    .buttonStyle(IslandButtonStyle(.money))
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 2)
        }
    }
}

/// Cents in large rounded type, the digits monospaced so amounts line up and don't jitter.
struct AmountText: View {
    let cents: Int
    var size: CGFloat = 28
    var style: AnyShapeStyle = AnyShapeStyle(IslandStyle.text)

    var body: some View {
        Text(Money.format(cents))
            .font(.system(size: size, weight: .semibold, design: .rounded).monospacedDigit())
            .tracking(-0.01 * size)
            .foregroundStyle(style)
            .contentTransition(.numericText())
    }
}

// MARK: Takeover

/// "Plex needs you": something only the user can do (sign in, pass a check), then I've done it.
struct TakeoverCard: View {
    let task: TaskItem
    let agent: AgentSession

    private var takeover: TaskItem.Takeover? { task.takeover }
    private var isLogin: Bool { takeover?.kind == "login" }

    var body: some View {
        IslandCard(highlighted: true) {
            CardTitle(title: "Plex needs you", trailing: task.title) {
                PlexIconTile(symbol: isLogin ? "shield-check" : "mouse-pointer-2", tint: .glass, size: 22)
            }
        } content: {
            Text(takeover?.title ?? task.title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(IslandStyle.text)
                .fixedSize(horizontal: false, vertical: true)
            if let detail = takeover?.detail, !detail.isEmpty {
                Text(detail)
                    .font(.system(size: 12.5))
                    .foregroundStyle(IslandStyle.text2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, -3)
            }
            HStack(spacing: 8) {
                if let link = takeover?.url, let url = URL(string: link) {
                    Button { NSWorkspace.shared.open(url) } label: {
                        PlexLabel("Open", icon: "arrow-up-right")
                    }
                    .buttonStyle(IslandButtonStyle(.secondary))
                    .help(link)
                }
                Spacer()
                Button("Cancel") { agent.cancel(task) }
                    .buttonStyle(IslandButtonStyle(.ghost))
                Button("I've done it") { agent.continueTask(task) }
                    .buttonStyle(IslandButtonStyle(.primary))
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 2)
        }
    }
}

// MARK: Question

struct QuestionCard: View {
    let task: TaskItem
    let agent: AgentSession
    @State private var reply = ""
    @Environment(\.islandRendering) private var rendering

    var body: some View {
        IslandCard(highlighted: true) {
            CardTitle(title: task.title, trailing: task.routine?.name) {
                PlexIconTile(symbol: "message-circle", tint: .glass, size: 22)
            }
        } content: {
            ViewsList(task: task, agent: agent)
            if let question = task.question {
                Text(question)
                    .font(.system(size: 13.5))
                    .foregroundStyle(IslandStyle.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !task.options.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(task.options, id: \.self) { option in
                        Button(option) { agent.answer(task, text: option) }
                            .buttonStyle(IslandButtonStyle(.secondary))
                    }
                }
            }
            HStack(spacing: 8) {
                let prompt = task.options.isEmpty ? "Type your answer, or just say it" : "Or type something else"
                if rendering {
                    Text(prompt).font(.system(size: 13)).foregroundStyle(IslandStyle.text3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    TextField(prompt, text: $reply)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                        .foregroundStyle(.white)
                        .onSubmit(send)
                }
                Button("Send", action: send)
                    .buttonStyle(IslandButtonStyle(.primary))
                    .disabled(reply.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.leading, 12)
            .padding(.trailing, 5)
            .padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(IslandStyle.raised))
        }
    }

    private func send() {
        agent.answer(task, text: reply)
        reply = ""
    }
}

// MARK: Progress

/// A task at work, done or failed.
struct ProgressCard: View {
    let task: TaskItem
    let agent: AgentSession

    var body: some View {
        IslandCard(highlighted: task.status == "needs_confirmation") {
            HStack(spacing: 8) {
                statusIcon.frame(width: 18, height: 16)
                Text(task.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(IslandStyle.text)
                    .lineLimit(1)
                Spacer(minLength: 8)
                if task.isOver {
                    IconButton(symbol: "x", help: "Dismiss") { agent.dismiss(task) }
                } else {
                    Button("Stop") { agent.cancel(task) }
                        .buttonStyle(.plain)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(IslandStyle.text3)
                }
            }
        } content: {
            content
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch task.status {
        case "running":
            Bars(level: { t in 0.18 + 0.12 * sin(t * 4) }, spread: 1.2)
                .scaleEffect(0.8)
        case "needs_confirmation":
            PlexIcon(symbol: "hand", size: 13, color: nil).foregroundStyle(IslandStyle.accent)
        case "done":
            PlexIcon(symbol: "circle-check", size: 13, color: nil)
                .foregroundStyle(task.receipt.map { !$0.isRefund } ?? false ? IslandStyle.money : IslandStyle.text2)
        case "failed":
            PlexIcon(symbol: "triangle-alert", size: 13, color: nil).foregroundStyle(IslandStyle.bad)
        default:
            PlexIcon(symbol: "circle-x", size: 13, color: nil).foregroundStyle(IslandStyle.text3)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch task.status {
        case "running":
            if let step = task.steps.last {
                Text(step)
                    .font(.system(size: 12))
                    .foregroundStyle(IslandStyle.text2)
                    .lineLimit(1)
                    .contentTransition(.opacity)
            }
            ViewsList(task: task, agent: agent)
        case "needs_confirmation":
            // A yes or no that isn't a payment (sending a message, cancelling a subscription).
            ViewsList(task: task, agent: agent)
            if let confirm = task.confirm {
                Text(confirm.title)
                    .font(.system(size: 13))
                    .foregroundStyle(IslandStyle.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = confirm.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundStyle(IslandStyle.text2)
                        .lineLimit(4)
                }
            }
            HStack(spacing: 8) {
                Text("Or just say yes")
                    .font(.system(size: 11))
                    .foregroundStyle(IslandStyle.text3)
                Spacer()
                Button("Not now") { agent.confirm(task, approved: false) }
                    .buttonStyle(IslandButtonStyle(.secondary))
                Button("Go ahead") { agent.confirm(task, approved: true) }
                    .buttonStyle(IslandButtonStyle(.primary))
                    .keyboardShortcut(.defaultAction)
            }
        case "done":
            if let say = task.say {
                Text(say)
                    .font(.system(size: 12.5))
                    .foregroundStyle(IslandStyle.text)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !task.cards.isEmpty {
                PicksRow(cards: task.cards)
            }
            ViewsList(task: task, agent: agent)
        case "failed":
            Text(task.error ?? "That didn't work. Ask me to try again.")
                .font(.system(size: 12))
                .foregroundStyle(IslandStyle.text2)
                .lineLimit(3)
        default:
            EmptyView()
        }
    }
}

/// Rich cards: the newest while the task works, all of them (up to six) once it's done.
private struct ViewsList: View {
    let task: TaskItem
    let agent: AgentSession

    var body: some View {
        let shown = task.isOver ? Array(task.views.prefix(6)) : Array(task.views.suffix(1))
        ForEach(shown) { view in
            TaskViewCard(view: view, agent: agent, taskTitle: task.title)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(IslandStyle.raised.opacity(0.6)))
                .transition(.opacity)
        }
    }
}

// MARK: Receipt

/// Money moved: amount, payee, why (the user's own words), the rule, the state, with a thin
/// steel foil edge on the left, like the receipt cards on the web.
struct ReceiptCard: View {
    let receipt: ReceiptItem

    var body: some View {
        HStack(spacing: 0) {
            ZStack(alignment: .leading) {
                Rectangle().fill(IslandStyle.foil).frame(width: 4)
                Rectangle().fill(IslandStyle.foil).frame(width: 10).blur(radius: 7).opacity(0.35)
            }
            .frame(width: 4, alignment: .leading)
            .zIndex(1)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 7) {
                    if receipt.isRefund {
                        PlexIcon(symbol: "undo-2", size: 14, color: nil)
                            .foregroundStyle(IslandStyle.accent)
                    } else {
                        PlexIconTile(symbol: "receipt", tint: .glass, size: 22)
                    }
                    Text("\(AgentSession.verb(receipt).capitalized) \(receipt.payee)")
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(IslandStyle.text)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if let label = receipt.stateLabel {
                        let steel = receipt.isRefund || receipt.isRecordOnly
                        Text(label)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(steel ? IslandStyle.accent : IslandStyle.money)
                            .padding(.horizontal, 8)
                            .frame(height: 20)
                            .background(Capsule().fill((steel ? IslandStyle.accent : IslandStyle.money).opacity(0.14)))
                    }
                }
                // Money that moved glows green; a cancellation or an invoice is steel (nothing left the pots).
                AmountText(cents: receipt.amountCents, size: 26,
                           style: AnyShapeStyle(receipt.isRefund || receipt.isRecordOnly ? AnyShapeStyle(IslandGlow.held) : AnyShapeStyle(IslandGlow.money)))
                if let why = receipt.why, !why.isEmpty {
                    Text("\u{201C}\(why)\u{201D}")
                        .font(.system(size: 12.5))
                        .foregroundStyle(IslandStyle.text2)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let rule = receipt.ruleText, !rule.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        PlexIcon(symbol: "shield-check", size: 10.5, color: nil)
                        Text(rule).lineLimit(1)
                    }
                    .font(.system(size: 11.5))
                    .foregroundStyle(IslandStyle.text3)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(IslandStyle.card)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

// MARK: Picks and buttons

/// A card from a task (a link, an option), with its image when it has one.
struct CardTile: View {
    let card: TaskItem.Card

    var body: some View {
        Button {
            if let link = card.url, let url = URL(string: link) { NSWorkspace.shared.open(url) }
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                if card.image != nil {
                    RemoteImage(url: card.image)
                        .frame(width: 132, height: 78)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                Text(card.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                if let line = card.reason ?? card.subtitle {
                    Text(line)
                        .font(.system(size: 11))
                        .foregroundStyle(IslandStyle.text2)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(width: 132, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(card.reason ?? card.title)
    }
}

/// A row of cards: plain when they fit, scrolling when there are more.
struct PicksRow: View {
    let cards: [TaskItem.Card]

    var body: some View {
        let row = HStack(alignment: .top, spacing: 8) {
            ForEach(cards) { CardTile(card: $0) }
        }
        ViewThatFits(in: .horizontal) {
            row
            ScrollView(.horizontal) { row }.scrollIndicators(.never)
        }
    }
}

/// The island's buttons, by role (the web's Button roles): `primary` (white on black) for the
/// main action, `money` (green) only when money moves, `secondary` and `ghost` for the rest.
struct IslandButtonStyle: ButtonStyle {
    enum Role { case primary, money, secondary, ghost }
    let role: Role

    init(_ role: Role) { self.role = role }
    init(primary: Bool) { role = primary ? .primary : .secondary }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12.5, weight: .semibold))
            .labelStyle(TightLabel())
            .foregroundStyle(foreground)
            .padding(.horizontal, role == .ghost ? 8 : 14)
            .frame(height: 30)
            .background(Capsule().fill(background(pressed: configuration.isPressed)))
            .contentShape(Capsule())
    }

    private var foreground: Color {
        switch role {
        case .primary: Color(hex: 0x0C1512)
        case .money: IslandStyle.onMoney
        case .secondary: IslandStyle.text
        case .ghost: IslandStyle.text2
        }
    }

    private func background(pressed: Bool) -> Color {
        switch role {
        case .primary: pressed ? Color.white.opacity(0.82) : .white
        case .money: pressed ? Plex.green500 : Plex.green400
        case .secondary: pressed ? Color(hex: 0x34353C) : IslandStyle.raised
        case .ghost: pressed ? IslandStyle.raised : .clear
        }
    }
}

private struct TightLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 5) {
            configuration.title
            configuration.icon.font(.system(size: 11, weight: .semibold))
        }
    }
}
