import SwiftUI

/// Routines: what Plex does on its own (`routines:list`), each one a row you can open, run or pause.
struct RoutinesPage: View {
    @Bindable var model: MainWindowModel
    @State private var routines = LiveQuery<[RoutineDoc]>("routines:list")
    /// Toggles flip at once; Convex catches up on the next poll.
    @State private var enabledOverride: [String: Bool] = [:]

    var body: some View {
        MWPage {
            MWPageHeader(title: "Routines",
                         glossy: "plex-money-loop",
                         subtitle: "Things Plex does on its own, on a schedule or when something happens. Every money step is checked against your limits, every time.") {
                Button { model.newRoutine() } label: { Label("New routine", systemImage: "plus") }
                    .mwButton(.primary)
                    .keyboardShortcut("n", modifiers: .command)
            }
            MWQueryBanner(query: routines)

            if let list = routines.value {
                if list.isEmpty {
                    VStack(spacing: 14) {
                        MWEmptyState(symbol: "arrow.triangle.2.circlepath", title: "No routines yet",
                                     message: "Tell Plex what to do and when, the way you'd tell a person. It turns that into steps you can check before anything runs.")
                        Button { model.newRoutine() } label: { Label("New routine", systemImage: "plus") }
                            .mwButton(.primary)
                    }
                } else {
                    let enabled = list.filter { isOn($0) }
                    let paused = list.filter { !isOn($0) }
                    section(nil, enabled)
                    if !paused.isEmpty { section("Paused", paused) }
                }
            } else if !routines.settled {
                MWSkeletonRows(count: 5, leading: 34)
            }
        }
        .task { await routines.run() }
    }

    private func isOn(_ r: RoutineDoc) -> Bool { enabledOverride[r.id] ?? r.enabled }

    @ViewBuilder private func section(_ title: String?, _ items: [RoutineDoc]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                if let title { MWSectionTitle(title, count: items.count) }
                MWListCard {
                    ForEach(items.indices, id: \.self) { i in
                        if i > 0 { MWDivider() }
                        RoutineRow(routine: items[i], enabled: Binding(
                            get: { isOn(items[i]) },
                            set: { value in setEnabled(items[i], value) }
                        )) {
                            model.openRoutineID = items[i].id
                        }
                    }
                }
            }
        }
    }

    private func setEnabled(_ routine: RoutineDoc, _ on: Bool) {
        enabledOverride[routine.id] = on
        Task {
            _ = try? await ConvexClient.shared.mutation("routines:setEnabled", ["routineId": .string(routine.id), "enabled": .bool(on)])
            await routines.refresh()
            enabledOverride[routine.id] = nil
        }
    }
}

struct RoutineRow: View {
    let routine: RoutineDoc
    @Binding var enabled: Bool
    let open: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 14) {
            Button(action: open) {
                HStack(spacing: 14) {
                    MWGlossyTile(name: WindowFormat.routineGlossy(routine.icon, trigger: routine.spec.trigger, money: routine.spec.movesMoney), size: 40)
                        .opacity(enabled ? 1 : 0.6)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text(routine.name)
                                .font(.system(size: 13.5, weight: .semibold))
                                .foregroundStyle(enabled ? Plex.ink : Plex.muted)
                                .lineLimit(1)
                            if routine.spec.movesMoney {
                                MWIcon(symbol: "dollarsign.circle", size: 11.5, color: Plex.steel500)
                                    .help("Moves money, within your limits")
                            }
                        }
                        HStack(spacing: 5) {
                            MWIcon(symbol: WindowFormat.triggerSymbol(routine.spec.trigger), size: 10.5, color: Plex.faint)
                            Text(WindowFormat.trigger(routine.spec.trigger))
                                .font(.system(size: 12.5))
                                .foregroundStyle(Plex.muted)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    lastResult
                        .frame(width: 250, alignment: .leading)

                    VStack(alignment: .trailing, spacing: 3) {
                        Text("Next run")
                            .font(.system(size: 11))
                            .foregroundStyle(Plex.faint)
                        Text(nextRun)
                            .font(.system(size: 12.5, weight: .medium))
                            .foregroundStyle(enabled ? Plex.ink2 : Plex.faint)
                            .lineLimit(1)
                    }
                    .frame(width: 104, alignment: .trailing)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            MWSwitch(isOn: $enabled)
                .help(enabled ? "Pause this routine" : "Turn this routine on")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(hovering ? Plex.canvas.opacity(0.7) : .clear)
        .onHover { hovering = $0 }
    }

    private var nextRun: String {
        guard enabled else { return "Paused" }
        if let next = routine.nextRunAt { return WindowFormat.relative(next) }
        switch routine.spec.trigger {
        case .manual: return "When you ask"
        case .schedule: return "Not scheduled"
        default: return "On its trigger"
        }
    }

    @ViewBuilder private var lastResult: some View {
        if let last = routine.lastRun {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                MWDot(color: last.status.color, size: 7)
                    .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                VStack(alignment: .leading, spacing: 2) {
                    Text(last.summary.flatMap { $0.isEmpty ? nil : $0 } ?? last.status.label)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Plex.ink2)
                        .lineLimit(1)
                    if let at = last.startedAt {
                        Text("\(last.status.label) \u{00B7} \(WindowFormat.relative(at))")
                            .font(.system(size: 11.5))
                            .foregroundStyle(Plex.faint)
                            .lineLimit(1)
                    }
                }
            }
        } else {
            Text("Hasn't run yet")
                .font(.system(size: 12.5))
                .foregroundStyle(Plex.faint)
        }
    }
}
