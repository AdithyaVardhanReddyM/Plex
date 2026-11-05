import SwiftUI

/// Everything Plex did (`agent:activity`), by day, filterable by kind.
struct ActivityPage: View {
    @State private var feed = LiveQuery<[ActivityDoc]>("agent:activity", ["limit": .number(200)])
    @State private var filter: Filter = .all

    enum Filter: String, CaseIterable, Identifiable {
        case all, money, routines, handoffs, memory
        var id: String { rawValue }

        var title: String {
            switch self {
            case .all: "All"
            case .money: "Money"
            case .routines: "Routines"
            case .handoffs: "Hand-offs"
            case .memory: "Memory"
            }
        }

        func matches(_ item: ActivityDoc) -> Bool {
            switch self {
            case .all: true
            case .money: item.kind == .money || item.receiptId != nil
            case .routines: item.kind == .routine || item.runId != nil || item.routineId != nil
            case .handoffs: item.kind == .handoff
            case .memory: item.kind == .memory
            }
        }
    }

    var body: some View {
        MWPage(maxWidth: 820) {
            MWPageHeader(title: "Activity", glossy: "plex-mint-chat", subtitle: "Every run, task, hand-off and payment, as it happened.")
            HStack(spacing: 6) {
                ForEach(Filter.allCases) { f in
                    MWChip(title: f.title, count: feed.value.map { list in list.filter(f.matches).count },
                           selected: filter == f) { filter = f }
                }
            }
            MWQueryBanner(query: feed)

            if let items = feed.value {
                let shown = items.filter(filter.matches)
                if shown.isEmpty {
                    MWEmptyState(symbol: "list.bullet", title: filter == .all ? "Nothing yet" : "Nothing here yet",
                                 message: filter == .all ? "What Plex does shows up here as it happens." : "Nothing of this kind has happened yet.")
                } else {
                    ForEach(days(shown), id: \.0) { day, rows in
                        VStack(alignment: .leading, spacing: 10) {
                            MWSectionTitle(WindowFormat.dayHeading(day), count: rows.count)
                            MWListCard {
                                ForEach(rows.indices, id: \.self) { i in
                                    ActivityRow(item: rows[i], first: i == 0, last: i == rows.count - 1, showTime: .clock)
                                }
                            }
                        }
                    }
                }
            } else if !feed.settled {
                MWSkeletonRows(count: 6, leading: 26)
            }
        }
        .task { await feed.run() }
    }

    private func days(_ items: [ActivityDoc]) -> [(Date, [ActivityDoc])] {
        let cal = Calendar.current
        let groups = Dictionary(grouping: items) { cal.startOfDay(for: $0.at) }
        return groups.keys.sorted(by: >).map { day in (day, groups[day]!.sorted { $0.at > $1.at }) }
    }
}
