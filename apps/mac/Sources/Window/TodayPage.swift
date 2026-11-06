import SwiftUI

/// Today: what needs you, what's coming up, what Plex did, and where the money stands (`agent:today`).
struct TodayPage: View {
    @Bindable var model: MainWindowModel
    @State private var today = LiveQuery<TodayDoc>("agent:today")

    var body: some View {
        MWPage {
            header
            MWQueryBanner(query: today)
            if model.paused {
                MWBanner(message: "All agent spending is paused. Every payment is blocked until you resume, whatever the pot's rules say.",
                         symbol: "circle-pause", action: ("Resume", { Task { await model.setPaused(false) } }))
            }
            HStack(alignment: .top, spacing: 24) {
                VStack(alignment: .leading, spacing: 28) {
                    needsYou
                    recent
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 28) {
                    comingUp
                    pots
                }
                .frame(width: 300)
            }
        }
        .task { await today.run() }
    }

    private var doc: TodayDoc? { today.value }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(Plex.faint)
            Text(greeting)
                .font(.system(size: 34, weight: .bold))
                .tracking(-1.1)
                .foregroundStyle(Plex.ink)
            statusLine
                .padding(.top, 2)
            pulse
                .padding(.top, 16)
        }
    }

    /// The money pulse: this month at a glance, as three icon tiles.
    @ViewBuilder private var pulse: some View {
        HStack(spacing: 12) {
            StatTile(icon: "wallet", label: "Spent this month", cents: doc?.spentMonthCents)
            StatTile(icon: "calendar", label: "Bills due in 14 days", cents: doc?.billsDueCents)
            StatTile(icon: "refresh-cw", label: "Saved this month", cents: doc?.savedMonthCents)
        }
    }

    private var greeting: String {
        let name = doc?.firstName ?? ""
        return name.isEmpty ? WindowFormat.greeting() : "\(WindowFormat.greeting()), \(name)"
    }

    @ViewBuilder private var statusLine: some View {
        if let doc {
            let need = doc.needsYou.count
            let ran = doc.recent.filter { $0.kind == .routine && $0.runId != nil && Calendar.current.isDateInToday($0.at) }.count
            let next = doc.routines.compactMap(\.nextRunAt).filter { $0 > .now }.min()
            let routinePart: (String, String) = ran > 0
                ? ("\(ran)", ran == 1 ? " routine ran today" : " routines ran today")
                : (next.map { "Next routine " + WindowFormat.relative($0) } ?? "\(doc.routines.count)", next == nil ? " routines coming up" : "")
            let parts: [(String, String)] = [
                (need == 0 ? "Nothing" : "\(need)", need == 1 ? " thing needs you" : (need == 0 ? " needs you" : " things need you")),
                routinePart,
                (Money.format(doc.spentMonthCents, whole: true), " spent this month"),
            ]
            parts.enumerated().reduce(Text("")) { text, item in
                let (i, part) = item
                let sep = i == 0 ? Text("") : Text("   \u{00B7}   ").foregroundColor(Plex.faint)
                return text + sep + Text(part.0).foregroundColor(Plex.ink).fontWeight(.medium) + Text(part.1).foregroundColor(Plex.muted)
            }
            .font(.system(size: 13.5))
        } else if !today.settled {
            MWSkeleton(width: 360, height: 12)
        }
    }

    // MARK: Needs you

    @ViewBuilder private var needsYou: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Needs you", count: doc.map { $0.needsYou.count }, icon: "hand", tint: .steel) {
                if (doc?.needsYou.count ?? 0) > 2 {
                    Button("See all") { model.go(.needsYou) }
                        .buttonStyle(.plain)
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Plex.muted)
                }
            }
            if let doc {
                let asks = model.withSettling(doc.needsYou)
                if asks.isEmpty {
                    HStack(spacing: 10) {
                        MWIcon(symbol: "circle-check", size: 14, color: Plex.green600)
                        Text("You're all caught up. Approvals and questions from Plex land here.")
                            .font(.system(size: 13))
                            .foregroundStyle(Plex.muted)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .mwCard(radius: 18, padding: 0)
                } else {
                    ForEach(asks.prefix(2)) { ask in AskCard(ask: ask, model: model, compact: true) }
                }
            } else {
                MWSkeleton(height: 150, radius: Plex.radiusLG)
            }
        }
    }

    // MARK: Recent

    private var recent: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Recent activity", icon: "message-circle") {
                Button("All activity") { model.go(.activity) }
                    .buttonStyle(.plain)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Plex.muted)
            }
            if let doc {
                if doc.recent.isEmpty {
                    MWEmptyState(symbol: "list", title: "Nothing yet",
                                 message: "What Plex does, from routines to payments, shows up here as it happens.", compact: true)
                } else {
                    MWListCard {
                        let rows = Array(doc.recent.prefix(8))
                        ForEach(rows.indices, id: \.self) { i in
                            ActivityRow(item: rows[i], first: i == 0, last: i == rows.count - 1, showTime: .relative)
                        }
                    }
                }
            } else {
                MWSkeletonRows(count: 4, leading: 26)
            }
        }
    }

    // MARK: Coming up

    private var comingUp: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle("Coming up", icon: "calendar")
            if let doc {
                if doc.bills.isEmpty && doc.routines.isEmpty {
                    MWEmptyState(symbol: "calendar", title: "A clear week", message: "Bills due and routines about to run show up here.", compact: true)
                } else {
                    MWListCard {
                        let bills = Array(doc.bills.prefix(4))
                        ForEach(bills.indices, id: \.self) { i in
                            if i > 0 { MWDivider(inset: 58) }
                            UpcomingBillRow(bill: bills[i])
                        }
                        let routines = Array(doc.routines.prefix(3))
                        if !bills.isEmpty, !routines.isEmpty { MWDivider() }
                        ForEach(routines.indices, id: \.self) { i in
                            if i > 0 { MWDivider(inset: 58) }
                            Button {
                                model.section = .routines
                                model.openRoutineID = routines[i].id
                            } label: { UpcomingRoutineRow(routine: routines[i]) }
                                .buttonStyle(.plain)
                        }
                    }
                }
            } else {
                MWSkeletonRows(count: 3, leading: 34)
            }
        }
    }

    // MARK: Pots

    private var pots: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle(title: "Pots", icon: "wallet") {
                Button("Money") { model.go(.money) }
                    .buttonStyle(.plain)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Plex.muted)
            }
            if let doc {
                if doc.pots.isEmpty {
                    MWEmptyState(symbol: "layout-grid", title: "No pots yet", message: "Pots set what agents may spend, in your words.", compact: true)
                } else {
                    MWListCard {
                        ForEach(doc.pots.indices, id: \.self) { i in
                            if i > 0 { MWDivider() }
                            PotLine(pot: doc.pots[i])
                        }
                    }
                }
            } else {
                MWSkeletonRows(count: 3)
            }
        }
    }
}

// MARK: Rows

/// One number of the money pulse on a white tile with its icon.
struct StatTile: View {
    let icon: String
    let label: String
    let cents: Int?

    var body: some View {
        HStack(spacing: 12) {
            MWIconTile(symbol: icon, size: 40)
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Plex.muted)
                    .lineLimit(1)
                if let cents {
                    MWAmount(cents: cents, size: 21, weight: .bold, whole: true)
                } else {
                    MWSkeleton(width: 80, height: 18)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Plex.surface.opacity(0.88), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(.white.opacity(0.9), lineWidth: 1))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Plex.ink.opacity(0.05)))
        .shadow(color: MWLook.shadow, radius: 14, y: 5)
    }
}

/// A bill in Coming up: a date tile, the payee, when it's due, the amount.
struct UpcomingBillRow: View {
    let bill: BillDoc

    var body: some View {
        HStack(spacing: 12) {
            DateTile(date: bill.dueAt, urgent: bill.status == "overdue")
            VStack(alignment: .leading, spacing: 3) {
                Text(bill.payee)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Plex.ink)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Text(bill.status == "paid" ? "Paid" : WindowFormat.due(bill.dueAt))
                        .foregroundStyle(bill.status == "overdue" ? Plex.disputed : Plex.muted)
                    if bill.autopay {
                        Text("\u{00B7}").foregroundStyle(Plex.faint)
                        Text("Autopay").foregroundStyle(Plex.muted)
                    }
                }
                .font(.system(size: 11.5))
                .lineLimit(1)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 3) {
                MWAmount(cents: bill.amountCents, size: 13)
                if bill.isSpike {
                    Text("+\(bill.spikePercent)%")
                        .font(.system(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Plex.refunded)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

/// A month and day on a small tile.
struct DateTile: View {
    let date: Date
    var urgent = false

    var body: some View {
        VStack(spacing: 0) {
            Text(date.formatted(.dateTime.month(.abbreviated)).uppercased())
                .font(.system(size: 8.5, weight: .bold))
                .tracking(0.4)
                .foregroundStyle(urgent ? Plex.disputed : Plex.muted)
            Text(date.formatted(.dateTime.day()))
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Plex.ink)
        }
        .frame(width: 34, height: 34)
        .background(Plex.canvas, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Plex.line))
    }
}

struct UpcomingRoutineRow: View {
    let routine: UpcomingRoutine

    var body: some View {
        HStack(spacing: 12) {
            MWIconTile(symbol: WindowFormat.routineIcon(routine.icon, trigger: .manual, money: false), size: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(routine.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Plex.ink)
                    .lineLimit(1)
                Text(routine.nextRunAt.map { "Runs \(WindowFormat.relative($0))" } ?? "Waiting for its trigger")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Plex.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            MWIcon(symbol: "chevron-right", size: 10, color: Plex.faint)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// A pot on one line with its spent-of-budget bar.
struct PotLine: View {
    let pot: PotDoc

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                MWIconTile(symbol: WindowFormat.potSymbol(pot.icon), tint: .green, size: 28)
                Text(pot.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Plex.ink)
                Spacer(minLength: 6)
                MWAmount(cents: pot.balanceCents, size: 13, whole: true)
                Text("left")
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.muted)
            }
            if pot.monthlyBudgetCents > 0 {
                MWBar(fraction: pot.spentFraction)
                Text("\(Money.format(pot.spentMonthCents, whole: true)) of \(Money.format(pot.monthlyBudgetCents, whole: true)) spent this month")
                    .font(.system(size: 11.5))
                    .foregroundStyle(Plex.muted)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
    }
}

/// One line of the activity feed, on a timeline rail.
struct ActivityRow: View {
    enum TimeStyle { case relative, clock }

    let item: ActivityDoc
    var first = false
    var last = false
    var showTime: TimeStyle = .clock

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack(alignment: .top) {
                // The rail: joins this row's icon to its neighbours'.
                VStack(spacing: 0) {
                    Rectangle().fill(first ? .clear : Plex.line).frame(width: 1, height: 12)
                    Rectangle().fill(last ? .clear : Plex.line).frame(width: 1).frame(maxHeight: .infinity)
                }
                Circle()
                    .fill(tileColor)
                    .overlay(Circle().strokeBorder(Plex.surface, lineWidth: 2))
                    .overlay(MWIcon(symbol: WindowFormat.activitySymbol(item.kind), size: 11, color: iconColor))
                    .frame(width: 26, height: 26)
                    .padding(.top, 0)
            }
            .frame(width: 26)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Plex.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail = item.detail, !detail.isEmpty {
                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundStyle(Plex.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.top, 4)
            .padding(.bottom, last ? 0 : 6)
            Spacer(minLength: 8)
            Text(showTime == .clock ? WindowFormat.time(item.at) : WindowFormat.relative(item.at))
                .font(.system(size: 11.5))
                .monospacedDigit()
                .foregroundStyle(Plex.faint)
                .padding(.top, 5)
        }
        .padding(.horizontal, 14)
        .padding(.top, first ? 12 : 4)
        .padding(.bottom, last ? 12 : 4)
    }

    private var tileColor: Color {
        switch item.kind {
        case .money: Plex.green50
        case .handoff: Plex.steel50
        default: Plex.sunken
        }
    }

    private var iconColor: Color {
        switch item.kind {
        case .money: Plex.green700
        case .handoff: Plex.steel600
        default: Plex.ink2
        }
    }
}
