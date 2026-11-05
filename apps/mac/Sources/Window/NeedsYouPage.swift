import SwiftUI

/// Every pending ask, answerable here: money approvals, questions, and hand-offs (takeover, login).
struct NeedsYouPage: View {
    @Bindable var model: MainWindowModel

    private var asks: [AskDoc] { model.withSettling(model.pending.value ?? []) }

    var body: some View {
        MWPage {
            MWPageHeader(title: "Needs you",
                         glossy: "plex-money-hand",
                         subtitle: "When Plex needs a yes, an answer or your hands, it waits here and in the notch. Answer either one and it carries on.")
            MWQueryBanner(query: model.pending)

            if !model.pending.settled {
                VStack(spacing: 12) {
                    ForEach(0..<2, id: \.self) { _ in MWSkeleton(height: 150, radius: Plex.radiusLG) }
                }
            } else if asks.isEmpty {
                MWEmptyState(symbol: "checkmark", title: "Nothing needs you",
                             message: "Approvals, questions and hand-offs from Plex show up here. You're all caught up.")
            } else {
                group("Approvals", asks.filter { $0.kind == .approval })
                group("Questions", asks.filter { $0.kind == .question || $0.kind == .other })
                group("Hand-offs", asks.filter { $0.kind == .takeover || $0.kind == .login })
            }
        }
    }

    @ViewBuilder private func group(_ title: String, _ items: [AskDoc]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                MWSectionTitle(title, count: items.count, glossy: title == "Approvals" ? "plex-money-hand" : (title == "Questions" ? "plex-mint-chat" : "plex-mint-cursor"))
                ForEach(items) { ask in AskCard(ask: ask, model: model) }
            }
        }
    }
}

/// One ask with its answer controls. Allow is the only green button in the window: money moves.
struct AskCard: View {
    let ask: AskDoc
    let model: MainWindowModel
    var compact = false

    @State private var busy: String?
    @State private var problem: String?
    @State private var reply = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if ask.isMoney {
                // The foil edge: money that's held until you say so.
                Rectangle().fill(Plex.metal).frame(height: 4)
            }
            VStack(alignment: .leading, spacing: 12) {
                header
                content
                if let problem {
                    Label(problem, systemImage: "exclamationmark.triangle")
                        .font(.system(size: 12))
                        .foregroundStyle(Plex.disputed)
                }
                if let settling = model.settling[ask.id] {
                    SettlingLine(item: settling)
                } else {
                    controls
                }
            }
            .padding(compact ? 16 : 18)
        }
        .background(alignment: .top) {
            if ask.isMoney {
                LinearGradient(colors: [Plex.steel100.opacity(0.75), Plex.steel50.opacity(0.4), Plex.surface],
                               startPoint: .top, endPoint: .bottom)
                    .frame(height: 120)
            }
        }
        .background(Plex.surface)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Plex.ink.opacity(0.06)))
        .shadow(color: MWLook.shadow, radius: 14, y: 5)
        .disabled(busy != nil || model.settling[ask.id] != nil)
    }

    private var header: some View {
        HStack(spacing: 8) {
            MWGlossy(kindGlossy, size: 22)
            Text(ask.sourceLine)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Plex.muted)
                .lineLimit(1)
            Spacer(minLength: 8)
            Text(WindowFormat.relative(ask.createdAt))
                .font(.system(size: 12))
                .foregroundStyle(Plex.faint)
        }
    }

    private var kindGlossy: String {
        switch ask.kind {
        case .approval: ask.isMoney ? "plex-money-hand" : "plex-steel-shield"
        case .question: "plex-mint-chat"
        case .takeover: "plex-mint-cursor"
        case .login: "plex-steel-shield"
        case .other: "plex-mint-orb"
        }
    }

    private var kindSymbol: String {
        switch ask.kind {
        case .approval: ask.isMoney ? "lock.fill" : "hand.raised"
        case .question: "questionmark.bubble"
        case .takeover: "hand.point.up.left"
        case .login: "person.badge.key"
        case .other: "tray"
        }
    }

    @ViewBuilder private var content: some View {
        HStack(alignment: .firstTextBaseline, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                Text(ask.title)
                    .font(.system(size: compact ? 14.5 : 15.5, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(Plex.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = ask.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 13))
                        .foregroundStyle(Plex.ink2)
                        .lineSpacing(1.5)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if let cents = ask.amountCents {
                MWAmount(cents: cents, size: compact ? 22 : 26)
            }
        }
        if ask.isMoney, ask.ruleText != nil || ask.potName != nil || ask.payee != nil {
            HStack(spacing: 6) {
                MWIcon(symbol: "checkmark.shield", size: 11.5, color: Plex.steel600)
                Text(ruleLine)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Plex.steel700)
                    .lineLimit(2)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Plex.surface.opacity(0.7), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Plex.steel200.opacity(0.8)))
        }
    }

    private var ruleLine: String {
        var parts: [String] = []
        if let rule = ask.ruleText, !rule.isEmpty { parts.append("Asked because: \(rule)") }
        if let pot = ask.potName, !pot.isEmpty { parts.append("From the \(pot) pot") }
        if parts.isEmpty, let payee = ask.payee { parts.append("To \(payee)") }
        return parts.joined(separator: " \u{00B7} ")
    }

    @ViewBuilder private var controls: some View {
        switch ask.kind {
        case .approval:
            HStack(spacing: 8) {
                Button { answer("allow", approved: true) } label: {
                    buttonLabel("allow", ask.amountCents.map { "Allow \(Money.format($0, whole: true))" } ?? "Allow", symbol: "checkmark")
                }
                .mwButton(ask.isMoney ? .brand : .primary)
                Button { answer("deny", approved: false) } label: { buttonLabel("deny", "Deny") }
                    .mwButton(.secondary)
                if ask.isMoney {
                    Button { answer("always", approved: true, always: true) } label: {
                        buttonLabel("always", ask.payee.map { "Always allow \($0)" } ?? "Always allow")
                    }
                    .mwButton(.ghost)
                    .help(alwaysHelp)
                }
            }
        case .question, .other:
            VStack(alignment: .leading, spacing: 10) {
                if !ask.options.isEmpty {
                    FlowRow(spacing: 8) {
                        ForEach(ask.options, id: \.self) { option in
                            Button { answer(option, text: option) } label: { buttonLabel(option, option) }
                                .mwButton(.secondary)
                        }
                    }
                }
                HStack(spacing: 8) {
                    MWTextField(placeholder: ask.options.isEmpty ? "Type your answer" : "Or type something else", text: $reply) { sendReply() }
                    Button { sendReply() } label: { buttonLabel("reply", "Send", symbol: "arrow.up") }
                        .mwButton(.primary)
                        .disabled(reply.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        case .takeover, .login:
            HStack(spacing: 8) {
                Button { answer("done", approved: true, text: "done") } label: {
                    buttonLabel("done", ask.kind == .login ? "I've signed in" : "I've done it", symbol: "checkmark")
                }
                .mwButton(.primary)
                Button { answer("cancel", approved: false) } label: { buttonLabel("cancel", "Cancel") }
                    .mwButton(.ghost)
            }
        }
    }

    private var alwaysHelp: String {
        guard let payee = ask.payee, let cents = ask.amountCents else { return "Don't ask again for this payee" }
        return "Pay \(payee) up to \(Money.format(cents, whole: true)) without asking next time"
    }

    @ViewBuilder private func buttonLabel(_ key: String, _ title: String, symbol: String? = nil) -> some View {
        if busy == key {
            HStack(spacing: 6) {
                ProgressView().controlSize(.mini).tint(.white)
                Text(title)
            }
        } else if let symbol {
            Label(title, systemImage: symbol)
        } else {
            Text(title)
        }
    }

    private func sendReply() {
        let text = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        answer("reply", text: text)
    }

    private func answer(_ key: String, approved: Bool? = nil, always: Bool? = nil, text: String? = nil) {
        busy = key
        problem = nil
        Task {
            do {
                try await model.answer(ask, approved: approved, always: always, text: text)
                reply = ""
            } catch {
                problem = (error as? LocalizedError)?.errorDescription ?? "Couldn't send that. Try again."
            }
            busy = nil
        }
    }
}

/// After Allow: "Paying Pacific Power…", then "Paid", with the Always rule if one was added.
struct SettlingLine: View {
    let item: MainWindowModel.Settling

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let receipt = item.receipt {
                HStack(spacing: 8) {
                    MWIcon(symbol: "checkmark.circle.fill", size: 13, color: Plex.green600)
                    Text("Paid \(Money.format(receipt.amountCents)) to \(receipt.payeeLabel). Receipt written.")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Plex.green700)
                }
            } else {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.mini)
                    Text("Allowed. Paying \(item.ask.payee ?? "now")\u{2026}")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Plex.steel700)
                }
            }
            if item.always, let payee = item.ask.payee, let cents = item.ask.amountCents {
                HStack(spacing: 6) {
                    MWIcon(symbol: "checkmark.shield", size: 11.5, color: Plex.muted)
                    Text("Plex will pay \(payee) up to \(Money.format(cents, whole: true)) without asking\(item.ask.potName.map { ", from the \($0) pot" } ?? "").")
                        .font(.system(size: 12))
                        .foregroundStyle(Plex.muted)
                }
            }
        }
        .padding(.vertical, 2)
        .transition(.opacity)
    }
}

/// Lays children out in rows, wrapping when the line is full.
struct FlowRow: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
