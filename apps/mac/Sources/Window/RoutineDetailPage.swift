import SwiftUI

/// One routine (`routines:get`): the user's words, When → If → Then, where it runs, and its run history.
struct RoutineDetailPage: View {
    @Bindable var model: MainWindowModel
    let routineID: String

    @State private var detail: LiveQuery<RoutineDetailDoc>
    @State private var receipts = LiveQuery<[ReceiptDoc]>("receipts:list")
    @State private var confirmingDelete = false
    @State private var busy: String?
    @State private var note: String?
    @State private var expanded: Set<String> = []

    init(model: MainWindowModel, routineID: String) {
        self.model = model
        self.routineID = routineID
        _detail = State(initialValue: LiveQuery("routines:get", ["routineId": .string(routineID)]))
    }

    var body: some View {
        MWPage(maxWidth: 1000) {
            Button { model.openRoutineID = nil } label: {
                MWLabel("Routines", icon: "chevron-left")
            }
            .mwButton(.ghost, size: .small)
            .padding(.leading, -8)
            .padding(.bottom, -14)

            MWQueryBanner(query: detail)

            if let routine = detail.value?.routine {
                header(routine)
                if let note { MWBanner(message: note, symbol: "circle-check", tone: .steel) }
                HStack(alignment: .top, spacing: 28) {
                    VStack(alignment: .leading, spacing: 22) {
                        if !routine.prompt.isEmpty { words(routine.prompt) }
                        VStack(alignment: .leading, spacing: 14) {
                            MWSectionTitle("How it works", icon: "layout-grid")
                            RoutineFlow(spec: routine.spec)
                        }
                        facts(routine)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    history
                        .frame(width: 340)
                }
            } else if detail.settled {
                MWEmptyState(symbol: "folder-search", title: "This routine is gone", message: "It may have been deleted. Go back to see your routines.")
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    MWSkeleton(width: 280, height: 22)
                    MWSkeleton(width: 420, height: 12)
                    MWSkeleton(height: 260, radius: Plex.radiusLG)
                }
            }
        }
        .task { await detail.run() }
        .task { await receipts.run() }
        .confirmationDialog("Delete this routine?", isPresented: $confirmingDelete) {
            Button("Delete routine", role: .destructive) { remove() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Plex stops running it. Its past runs and receipts stay in your ledger.")
        }
    }

    // MARK: Header

    private func header(_ routine: RoutineDoc) -> some View {
        HStack(alignment: .top, spacing: 16) {
            MWIconTile(symbol: WindowFormat.routineIcon(routine.icon, trigger: routine.spec.trigger, money: routine.spec.movesMoney), size: 52)
            VStack(alignment: .leading, spacing: 8) {
                Text(routine.name)
                    .font(.system(size: 30, weight: .bold))
                    .tracking(-0.9)
                    .foregroundStyle(Plex.ink)
                if !routine.spec.summary.isEmpty {
                    Text(routine.spec.summary)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Plex.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 6) {
                    if routine.enabled {
                        MWBadge(text: "Active", tone: .outline, symbol: "circle-dot")
                    } else {
                        MWBadge(text: "Paused", tone: .amber, symbol: "pause")
                    }
                    MWBadge(text: routine.runWhere == "mac" ? "On this Mac" : "In the cloud", tone: .neutral,
                            symbol: routine.runWhere == "mac" ? "laptop" : "cloud")
                    if routine.spec.movesMoney {
                        MWBadge(text: "Moves money", tone: .steel, symbol: "lock")
                    }
                }
                .padding(.top, 2)
            }
            Spacer(minLength: 12)
            HStack(spacing: 8) {
                Button { runNow(routine) } label: {
                    if busy == "run" {
                        HStack(spacing: 6) { ProgressView().controlSize(.mini).tint(.white); Text("Run now") }
                    } else {
                        MWLabel("Run now", icon: "play")
                    }
                }
                .mwButton(.primary)
                Button { model.newRoutine(prompt: routine.prompt, draft: RoutineDraft(routine: routine), editing: routine.id) } label: {
                    MWLabel("Edit", icon: "pencil")
                }
                .mwButton(.secondary)
                Button { setEnabled(routine, !routine.enabled) } label: {
                    MWLabel(routine.enabled ? "Pause" : "Resume", icon: routine.enabled ? "pause" : "play")
                }
                .mwButton(.secondary)
                Button { confirmingDelete = true } label: { MWIcon(symbol: "trash-2", size: 13, color: nil) }
                    .mwButton(.danger)
                    .help("Delete this routine")
            }
            .disabled(busy != nil)
        }
    }

    private func words(_ prompt: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            MWIcon(symbol: "quote", size: 12, color: Plex.faint)
                .padding(.top, 3)
            VStack(alignment: .leading, spacing: 4) {
                Text("In your words")
                    .font(.system(size: 11.5, weight: .medium))
                    .foregroundStyle(Plex.faint)
                Text(prompt)
                    .font(.system(size: 14))
                    .foregroundStyle(Plex.ink)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Plex.surface, in: RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous).strokeBorder(Plex.line))
    }

    private func facts(_ routine: RoutineDoc) -> some View {
        MWListCard {
            fact("Runs", routine.runWhere == "mac" ? "On this Mac, while it's awake. It can use your apps and the screen." : "In the cloud, through your connected apps. Your Mac can be asleep.",
                 symbol: routine.runWhere == "mac" ? "laptop" : "cloud")
            MWDivider(inset: 42)
            fact("If it's missed", routine.missed == "skip" ? "Skips that run and waits for the next one." : "Runs as soon as your Mac wakes up.",
                 symbol: "moon-star")
            MWDivider(inset: 42)
            fact("Next run", routine.enabled ? (routine.nextRunAt.map { "\($0.formatted(.dateTime.weekday(.wide).month(.abbreviated).day().hour().minute())) (\(WindowFormat.relative($0)))" } ?? "When its trigger fires") : "Paused",
                 symbol: "calendar")
        }
    }

    private func fact(_ label: String, _ value: String, symbol: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            MWIcon(symbol: symbol, size: 12.5, color: Plex.faint).frame(width: 16).padding(.top, 1)
            Text(label)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(Plex.muted)
                .frame(width: 96, alignment: .leading)
            Text(value)
                .font(.system(size: 12.5))
                .foregroundStyle(Plex.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    // MARK: History

    private var history: some View {
        VStack(alignment: .leading, spacing: 12) {
            MWSectionTitle("Run history", count: detail.value?.runs.count, icon: "calendar")
            if let runs = detail.value?.runs {
                if runs.isEmpty {
                    MWEmptyState(symbol: "clock", title: "No runs yet", message: "Each time it runs, what it did and any receipts show up here.", compact: true)
                } else {
                    MWListCard {
                        ForEach(runs.indices, id: \.self) { i in
                            if i > 0 { MWDivider() }
                            RunRow(run: runs[i], receipts: receipts.value ?? [], expanded: Binding(
                                get: { expanded.contains(runs[i].id) },
                                set: { if $0 { expanded.insert(runs[i].id) } else { expanded.remove(runs[i].id) } }
                            ))
                        }
                    }
                }
            } else {
                MWSkeletonRows(count: 3, leading: 10)
            }
        }
    }

    // MARK: Actions

    private func runNow(_ routine: RoutineDoc) {
        busy = "run"
        note = nil
        Task {
            do {
                try await ConvexClient.shared.mutation("routines:runNow", ["routineId": .string(routine.id)])
                note = "Queued. Plex starts it in a moment, and it shows up in the history as it runs."
            } catch {
                note = (error as? LocalizedError)?.errorDescription
            }
            busy = nil
            await detail.refresh()
        }
    }

    private func setEnabled(_ routine: RoutineDoc, _ on: Bool) {
        busy = "toggle"
        Task {
            _ = try? await ConvexClient.shared.mutation("routines:setEnabled", ["routineId": .string(routine.id), "enabled": .bool(on)])
            busy = nil
            await detail.refresh()
        }
    }

    private func remove() {
        busy = "delete"
        Task {
            do {
                try await ConvexClient.shared.mutation("routines:remove", ["routineId": .string(routineID)])
                model.openRoutineID = nil
            } catch {
                note = (error as? LocalizedError)?.errorDescription
            }
            busy = nil
        }
    }
}

/// One run: why it ran, how it went, and on demand its steps and receipts.
struct RunRow: View {
    let run: RunDoc
    let receipts: [ReceiptDoc]
    @Binding var expanded: Bool

    private var runReceipts: [ReceiptDoc] { receipts.filter { run.receiptIds.contains($0.id) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.snappy(duration: 0.22)) { expanded.toggle() } } label: {
                HStack(alignment: .top, spacing: 10) {
                    MWDot(color: run.status.color, size: 8).padding(.top, 5)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(run.reason)
                                .font(.system(size: 12.5, weight: .medium))
                                .foregroundStyle(Plex.ink)
                                .lineLimit(1)
                            Spacer(minLength: 4)
                            if run.status != .done { MWBadge(text: run.status.label, tone: run.status.tone) }
                        }
                        Text(meta)
                            .font(.system(size: 11.5))
                            .foregroundStyle(Plex.faint)
                            .monospacedDigit()
                        if let summary = run.summary, !summary.isEmpty {
                            Text(summary)
                                .font(.system(size: 12.5))
                                .foregroundStyle(Plex.ink2)
                                .lineLimit(expanded ? nil : 2)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.top, 2)
                        }
                    }
                    MWIcon(symbol: "chevron-right", size: 9.5, color: Plex.faint)
                        .rotationEffect(.degrees(expanded ? 90 : 0))
                        .padding(.top, 4)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if expanded {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(run.steps) { step in
                        HStack(alignment: .top, spacing: 8) {
                            Text(step.at.map(WindowFormat.time) ?? "")
                                .font(.system(size: 10.5))
                                .monospacedDigit()
                                .foregroundStyle(Plex.faint)
                                .frame(width: 52, alignment: .leading)
                                .padding(.top, 1)
                            MWIcon(symbol: WindowFormat.runStepSymbol(step.kind), size: step.kind == "info" ? 4 : 10.5,
                                   color: step.kind == "error" ? Plex.disputed : (step.kind == "money" ? Plex.green600 : Plex.muted))
                                .frame(width: 14, height: 14)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(step.label)
                                    .font(.system(size: 12))
                                    .foregroundStyle(Plex.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let detail = step.detail, !detail.isEmpty {
                                    Text(detail)
                                        .font(.system(size: 11.5))
                                        .foregroundStyle(Plex.muted)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, 4)
                    }
                    if run.steps.isEmpty {
                        Text("No steps were logged for this run.")
                            .font(.system(size: 12))
                            .foregroundStyle(Plex.faint)
                    }
                    if !runReceipts.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(runReceipts) { receipt in
                                MWReceiptRow(receipt: receipt, showRule: true)
                            }
                        }
                        .background(Plex.surface, in: RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous))
                        .overlay(alignment: .top) { Rectangle().fill(Plex.metal).frame(height: 2).clipShape(UnevenRoundedRectangle(topLeadingRadius: Plex.radiusSM, topTrailingRadius: Plex.radiusSM)) }
                        .overlay(RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous).strokeBorder(Plex.line))
                        .padding(.top, 8)
                    } else if !run.receiptIds.isEmpty {
                        Text(run.receiptIds.count == 1 ? "1 receipt" : "\(run.receiptIds.count) receipts")
                            .font(.system(size: 11.5))
                            .foregroundStyle(Plex.muted)
                            .padding(.top, 6)
                    }
                }
                .padding(.leading, 32)
                .padding(.trailing, 14)
                .padding(.bottom, 12)
                .transition(.opacity)
            }
        }
    }

    private var meta: String {
        var parts = [run.startedAt.formatted(.dateTime.month(.abbreviated).day()) + ", " + WindowFormat.time(run.startedAt)]
        if let d = run.duration { parts.append(WindowFormat.duration(d)) }
        if !run.receiptIds.isEmpty { parts.append(run.receiptIds.count == 1 ? "1 receipt" : "\(run.receiptIds.count) receipts") }
        return parts.joined(separator: " \u{00B7} ")
    }
}
