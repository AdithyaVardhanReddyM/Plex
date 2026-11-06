import AppKit
import SwiftUI

/// Money: pots with their rules, bills, subscriptions, and the latest receipts.
struct MoneyPage: View {
    @Bindable var model: MainWindowModel
    @State private var pots = LiveQuery<[PotDoc]>("pots:list")
    @State private var bills = LiveQuery<[BillDoc]>("bills:list")
    @State private var subscriptions = LiveQuery<[SubscriptionDoc]>("subscriptions:list")
    @State private var receipts = LiveQuery<[ReceiptDoc]>("receipts:list")

    var body: some View {
        MWPage(maxWidth: 1000) {
            MWPageHeader(title: "Money",
                         icon: "wallet",
                         subtitle: "What agents may spend, what's due, and a receipt for every dollar that moved.") {
                Button { model.go(.insights) } label: {
                    PlexLabel("Insights", icon: "chart-column")
                }
                .mwButton(.secondary)
            }
            if model.paused {
                MWBanner(message: "All agent spending is paused. Pots keep their rules, but every payment is blocked until you resume.",
                         symbol: "circle-pause", action: ("Resume", { Task { await model.setPaused(false) } }))
            }
            potsSection
            billsSection
            subscriptionsSection
            receiptsSection
        }
        .task { await pots.run() }
        .task { await bills.run() }
        .task { await subscriptions.run() }
        .task { await receipts.run() }
    }

    // MARK: Pots

    /// Errands and Giving belong to Plex on the web (tasks and causes); the Mac doesn't spend from them.
    private var macPots: [PotDoc]? {
        pots.value?.filter { !["errands", "giving"].contains($0.name.lowercased()) }
    }

    private var potsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle("Pots", count: macPots?.count, icon: "wallet")
            MWQueryBanner(query: pots)
            if let list = macPots {
                if list.isEmpty {
                    MWEmptyState(symbol: "layout-grid", title: "No pots yet", message: "Pots hold what agents may spend, with limits in your own words. Create them in Plex on the web.", compact: true)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 200, maximum: 400), spacing: 12, alignment: .top)], spacing: 12) {
                        ForEach(list) { PotCard(pot: $0) }
                    }
                }
            } else if !pots.settled {
                HStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in MWSkeleton(height: 190, radius: Plex.radiusLG) } }
            }
        }
    }

    // MARK: Bills

    private var billsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Bills", count: bills.value?.count, icon: "calendar") {
                if let list = bills.value, !list.isEmpty {
                    let due = list.filter { $0.status != "paid" }.reduce(0) { $0 + $1.amountCents }
                    Text("\(Money.format(due, whole: true)) still to pay")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Plex.muted)
                        .monospacedDigit()
                }
            }
            MWQueryBanner(query: bills)
            if let list = bills.value {
                if list.isEmpty {
                    MWEmptyState(symbol: "file-text", title: "No bills yet", message: "Plex finds bills in your email and invoices, and lists them here before they're due.", compact: true)
                } else {
                    MWListCard {
                        TableHeader(columns: [("Payee", nil), ("Due", 128), ("Amount", 118), ("Usual", 84), ("Autopay", 78), ("Status", 96)],
                                    trailing: ["Amount", "Usual"])
                        ForEach(list) { bill in
                            MWDivider()
                            BillRow(bill: bill)
                        }
                    }
                }
            } else if !bills.settled {
                MWSkeletonRows(count: 4)
            }
        }
    }

    // MARK: Subscriptions

    private var subscriptionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Subscriptions", count: subscriptions.value?.count, icon: "refresh-cw") {
                if let list = subscriptions.value?.filter({ $0.status == "active" }), !list.isEmpty {
                    let monthly = list.reduce(0) { $0 + ($1.cadence == "yearly" ? $1.amountCents / 12 : $1.amountCents) }
                    Text("About \(Money.format(monthly, whole: true)) a month")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Plex.muted)
                        .monospacedDigit()
                }
            }
            MWQueryBanner(query: subscriptions)
            if let list = subscriptions.value {
                if list.isEmpty {
                    MWEmptyState(symbol: "repeat", title: "No subscriptions found", message: "Plex spots subscriptions in your receipts and email, and flags the ones you don't use.", compact: true)
                } else {
                    let flagged = list.filter { $0.status == "active" && ($0.priceWentUp || ($0.unusedDays() ?? 0) > 60) }
                    if !flagged.isEmpty {
                        MWBanner(message: flagged.count == 1 ? "1 subscription to look at: a price went up or you haven't used it in a while."
                                 : "\(flagged.count) subscriptions to look at: prices that went up, or ones you haven't used in a while.",
                                 symbol: "eye", tone: .neutral)
                    }
                    MWListCard {
                        TableHeader(columns: [("Merchant", nil), ("Amount", 150), ("Next charge", 118), ("Last used", 150), ("Status", 88)],
                                    trailing: ["Amount"])
                        ForEach(sorted(list)) { sub in
                            MWDivider()
                            SubscriptionRow(sub: sub)
                        }
                    }
                }
            } else if !subscriptions.settled {
                MWSkeletonRows(count: 4)
            }
        }
    }

    private func sorted(_ list: [SubscriptionDoc]) -> [SubscriptionDoc] {
        list.sorted { a, b in
            if (a.status == "active") != (b.status == "active") { return a.status == "active" }
            return (a.nextChargeAt ?? .distantFuture) < (b.nextChargeAt ?? .distantFuture)
        }
    }

    // MARK: Receipts

    private var receiptsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Recent receipts", icon: "receipt") {
                Button("See all in Activity") { model.go(.activity) }
                    .buttonStyle(.plain)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Plex.muted)
            }
            MWQueryBanner(query: receipts)
            if let list = receipts.value {
                if list.isEmpty {
                    MWEmptyState(symbol: "receipt", title: "No receipts yet", message: "Every time money moves, Plex writes a receipt: who, why in your words, and the rule that allowed it.", compact: true)
                } else {
                    MWListCard {
                        // The foil edge every receipt carries.
                        Rectangle().fill(Plex.metal).frame(height: 3)
                        let rows = Array(list.sorted { $0.occurredAt > $1.occurredAt }.prefix(8))
                        ForEach(rows.indices, id: \.self) { i in
                            if i > 0 { MWDivider(inset: 56) }
                            MWReceiptRow(receipt: rows[i])
                        }
                    }
                }
            } else if !receipts.settled {
                MWSkeletonRows(count: 4)
            }
        }
    }
}

// MARK: Pieces

struct PotCard: View {
    let pot: PotDoc

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                PlexIconTile(symbol: WindowFormat.potSymbol(pot.icon), tint: .green, size: 28)
                Text(pot.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Plex.ink2)
                    .lineLimit(1)
            }
            MWAmount(cents: pot.balanceCents, size: 22)
                .padding(.top, 12)
            Text("left in the pot")
                .font(.system(size: 11.5))
                .foregroundStyle(Plex.muted)
                .padding(.top, 2)
            if pot.monthlyBudgetCents > 0 {
                MWBar(fraction: pot.spentFraction)
                    .padding(.top, 10)
                Text("\(Money.format(pot.spentMonthCents, whole: true)) of \(Money.format(pot.monthlyBudgetCents, whole: true)) this month")
                    .font(.system(size: 11.5))
                    .monospacedDigit()
                    .foregroundStyle(Plex.muted)
                    .padding(.top, 6)
            }
            if !pot.rulesText.isEmpty {
                MWDivider().padding(.vertical, 10)
                Text("\u{201C}\(pot.rulesText)\u{201D}")
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.ink2)
                    .lineSpacing(1.5)
                    .lineLimit(2, reservesSpace: true)
                    .help(pot.rulesText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .mwCard(radius: 20, padding: 16)
    }
}

/// Column labels over a hand-built table. `nil` width is the flexible column.
private struct TableHeader: View {
    let columns: [(String, CGFloat?)]
    var trailing: Set<String> = []

    var body: some View {
        HStack(spacing: 12) {
            ForEach(columns.indices, id: \.self) { i in
                let (title, width) = columns[i]
                Text(title)
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(Plex.faint)
                    .frame(width: width, alignment: trailing.contains(title) ? .trailing : .leading)
                    .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 32)
        .background(Plex.canvas.opacity(0.6))
    }
}

private struct BillRow: View {
    let bill: BillDoc

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(bill.payee)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Plex.ink)
                    .lineLimit(1)
                Text(bill.category)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Plex.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                Text(WindowFormat.shortDate(bill.dueAt))
                    .font(.system(size: 12.5))
                    .foregroundStyle(Plex.ink)
                if bill.status != "paid", !WindowFormat.due(bill.dueAt).hasPrefix("Due \(WindowFormat.shortDate(bill.dueAt))") {
                    Text(WindowFormat.due(bill.dueAt))
                        .font(.system(size: 11.5))
                        .foregroundStyle(bill.status == "overdue" ? Plex.disputed : Plex.muted)
                }
            }
            .frame(width: 128, alignment: .leading)

            VStack(alignment: .trailing, spacing: 3) {
                MWAmount(cents: bill.amountCents, size: 13)
                if bill.isSpike {
                    HStack(spacing: 3) {
                        PlexIcon(symbol: "arrow-up-right", size: 8.5, color: nil)
                        Text("\(bill.spikePercent)% above usual")
                    }
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Plex.refunded)
                    .fixedSize()
                }
            }
            .frame(width: 118, alignment: .trailing)

            Group {
                if let usual = bill.usualCents {
                    MWAmount(cents: usual, size: 12.5, weight: .regular, color: Plex.muted)
                } else {
                    Text("\u{2014}").foregroundStyle(Plex.faint)
                }
            }
            .frame(width: 84, alignment: .trailing)

            Group {
                if bill.autopay {
                    MWBadge(text: "On", tone: .outline, symbol: "refresh-cw")
                } else {
                    Text("Off").font(.system(size: 12.5)).foregroundStyle(Plex.faint)
                }
            }
            .frame(width: 78, alignment: .leading)

            MWBadge(text: statusLabel, tone: statusTone)
                .frame(width: 96, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var statusLabel: String {
        switch bill.status {
        case "paid": "Paid"
        case "overdue": "Overdue"
        case "scheduled": "Scheduled"
        default: "Upcoming"
        }
    }

    private var statusTone: MWTone {
        switch bill.status {
        case "paid": .green
        case "overdue": .red
        case "scheduled": .steel
        default: .neutral
        }
    }
}

private struct SubscriptionRow: View {
    let sub: SubscriptionDoc

    private var unused: Int? { sub.unusedDays() }
    private var active: Bool { sub.status == "active" }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(sub.merchant)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(active ? Plex.ink : Plex.muted)
                    .lineLimit(1)
                Text([sub.plan, sub.category].filter { !$0.isEmpty }.joined(separator: " \u{00B7} "))
                    .font(.system(size: 11.5))
                    .foregroundStyle(Plex.muted)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .trailing, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    MWAmount(cents: sub.amountCents, size: 13, color: active ? Plex.ink : Plex.muted)
                    Text(sub.cadence == "yearly" ? "/yr" : "/mo")
                        .font(.system(size: 11.5))
                        .foregroundStyle(Plex.muted)
                }
                if sub.priceWentUp, let old = sub.previousAmountCents {
                    HStack(spacing: 3) {
                        Text(Money.format(old)).strikethrough(color: Plex.refunded.opacity(0.6))
                        PlexIcon(symbol: "arrow-right", size: 8, color: nil)
                        Text(Money.format(sub.amountCents))
                    }
                    .font(.system(size: 11, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Plex.refunded)
                    .fixedSize()
                }
            }
            .frame(width: 150, alignment: .trailing)

            Text(sub.nextChargeAt.map(WindowFormat.shortDate) ?? "\u{2014}")
                .font(.system(size: 12.5))
                .foregroundStyle(active ? Plex.ink : Plex.faint)
                .frame(width: 118, alignment: .leading)

            Group {
                if let days = unused, days > 60, active {
                    MWBadge(text: "Unused \(days) days", tone: .amber, symbol: "moon-star")
                } else if let last = sub.lastUsedAt {
                    Text(WindowFormat.relative(last))
                        .font(.system(size: 12.5))
                        .foregroundStyle(Plex.muted)
                } else {
                    Text("Unknown").font(.system(size: 12.5)).foregroundStyle(Plex.faint)
                }
            }
            .frame(width: 150, alignment: .leading)

            MWBadge(text: sub.status.capitalized, tone: active ? .outline : .neutral)
                .frame(width: 88, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}
