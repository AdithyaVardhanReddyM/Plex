import SwiftUI

/// New routine: describe it in your own words, Plex compiles it once (`POST /mac/routines/compile`),
/// you check the When → If → Then it understood, then save (`routines:save`).
struct NewRoutineSheet: View {
    let model: MainWindowModel

    enum Phase: Equatable { case describe, compiling, review }

    @State private var prompt: String
    @State private var phase: Phase
    @State private var draft: RoutineDraft?
    @State private var answers: [String: String] = [:]
    @State private var problem: String?
    @State private var saving = false
    @State private var renaming = false
    /// Editing an existing routine: save replaces it.
    let editingID: String?
    @FocusState private var editorFocused: Bool
    @Environment(\.dismiss) private var dismiss

    static let examples = [
        "Every Friday at 6pm, move half of what's left in Food to Savings",
        "When my Comcast bill arrives, pay it if it's under $100",
        "On the 1st, pay rent to Sam once both roommates have paid me",
        "Tell me when a subscription goes up in price",
    ]

    init(model: MainWindowModel, prompt: String = "", draft: RoutineDraft? = nil, editingID: String? = nil) {
        self.model = model
        self.editingID = editingID
        _prompt = State(initialValue: prompt)
        _draft = State(initialValue: draft)
        _phase = State(initialValue: draft == nil ? .describe : .review)
    }

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if phase == .review, let draft {
                    review(draft)
                } else {
                    describe
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            footer
        }
        .frame(width: 680, height: phase == .review ? 640 : 520)
        .background(alignment: .top) {
            MWAurora().frame(height: 260)
        }
        .background(Plex.canvas)
        .environment(\.colorScheme, .light)
        .animation(.snappy(duration: 0.28), value: phase)
    }

    // MARK: Describe

    private var describe: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text(editingID == nil ? "New routine" : "Edit routine")
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(Plex.faint)
                Text(editingID == nil ? "What should Plex do?" : "Say what should change")
                    .font(.system(size: 28, weight: .bold))
                    .tracking(-0.9)
                    .foregroundStyle(Plex.ink)
            }

            VStack(alignment: .leading, spacing: 0) {
                ZStack(alignment: .topLeading) {
                    if prompt.isEmpty {
                        Text("Describe it the way you'd tell a person")
                            .font(.system(size: 18))
                            .foregroundStyle(Plex.faint)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $prompt)
                        .font(.system(size: 18))
                        .foregroundStyle(Plex.ink)
                        .lineSpacing(4)
                        .scrollContentBackground(.hidden)
                        .focused($editorFocused)
                        .disabled(phase == .compiling)
                }
                .padding(14)
                .frame(height: 150)
                if phase == .compiling {
                    CompilingBar()
                        .frame(height: 2)
                        .padding(.horizontal, 1)
                }
            }
            .background(Plex.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(editorFocused ? Plex.ink.opacity(0.35) : Plex.line, lineWidth: editorFocused ? 1.5 : 1)
            )
            .shadow(color: MWLook.shadow, radius: 16, y: 6)

            VStack(alignment: .leading, spacing: 10) {
                Text("Or start from one of these")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Plex.muted)
                FlowRow(spacing: 8, lineSpacing: 8) {
                    ForEach(Self.examples, id: \.self) { example in
                        ExampleChip(text: example) {
                            prompt = example
                            editorFocused = true
                        }
                    }
                }
            }
            .opacity(phase == .compiling ? 0.5 : 1)
            .disabled(phase == .compiling)

            if let problem { MWBanner(message: problem, tone: .red) }
        }
        .padding(.horizontal, 32)
        .padding(.top, 28)
        .onAppear { editorFocused = true }
    }

    // MARK: Review

    private func review(_ draft: RoutineDraft) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Here's what Plex understood")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Plex.faint)
                    HStack(spacing: 12) {
                        PlexIconTile(symbol: WindowFormat.routineIcon(draft.icon, trigger: draft.spec.trigger, money: draft.spec.movesMoney), size: 46)
                        if renaming {
                            TextField("Name", text: Binding(get: { self.draft?.name ?? "" }, set: { self.draft?.name = $0 }))
                                .textFieldStyle(.plain)
                                .font(.system(size: 22, weight: .semibold))
                                .tracking(-0.4)
                                .foregroundStyle(Plex.ink)
                                .onSubmit { renaming = false }
                        } else {
                            Text(draft.name)
                                .font(.system(size: 22, weight: .semibold))
                                .tracking(-0.4)
                                .foregroundStyle(Plex.ink)
                                .lineLimit(1)
                            MWIconButton(symbol: "pencil", help: "Rename", color: Plex.faint) { renaming = true }
                        }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\u{201C}\(prompt.trimmingCharacters(in: .whitespacesAndNewlines))\u{201D}")
                            .font(.system(size: 13))
                            .foregroundStyle(Plex.muted)
                            .lineLimit(2)
                        Button("Edit") { phase = .describe }
                            .buttonStyle(.plain)
                            .font(.system(size: 12.5, weight: .medium))
                            .foregroundStyle(Plex.ink2)
                            .underline()
                    }
                    if !draft.spec.summary.isEmpty {
                        Text(draft.spec.summary)
                            .font(.system(size: 13.5))
                            .foregroundStyle(Plex.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if !draft.questions.isEmpty { questions(draft.questions) }

                RoutineFlow(spec: draft.spec, compact: true)

                VStack(spacing: 0) {
                    option("Where it runs", symbol: draft.runWhere == "mac" ? "laptop" : "cloud",
                           note: draft.runWhere == "mac" ? "Uses your Mac's apps and screen. Runs while it's awake." : "Runs through your connected apps, even while your Mac sleeps.") {
                        Picker("", selection: Binding(get: { self.draft?.runWhere ?? "cloud" }, set: { self.draft?.runWhere = $0 })) {
                            Text("On this Mac").tag("mac")
                            Text("In the cloud").tag("cloud")
                        }
                    }
                    MWDivider(inset: 42)
                    option("If it's missed", symbol: "moon-star",
                           note: draft.missed == "skip" ? "Skips it and waits for the next time." : "Runs as soon as your Mac wakes up.") {
                        Picker("", selection: Binding(get: { self.draft?.missed ?? "run_on_wake" }, set: { self.draft?.missed = $0 })) {
                            Text("Run on wake").tag("run_on_wake")
                            Text("Skip it").tag("skip")
                        }
                    }
                }
                .background(Plex.surface, in: RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous).strokeBorder(Plex.line))

                if let problem { MWBanner(message: problem, tone: .red) }
            }
            .padding(.horizontal, 32)
            .padding(.top, 28)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.never)
    }

    private func option<Control: View>(_ title: String, symbol: String, note: String, @ViewBuilder control: () -> Control) -> some View {
        HStack(spacing: 12) {
            PlexIcon(symbol: symbol, size: 13, color: Plex.muted).frame(width: 18)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(Plex.ink)
                Text(note).font(.system(size: 12)).foregroundStyle(Plex.muted).lineLimit(1)
            }
            Spacer(minLength: 12)
            control()
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
    }

    private func questions(_ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                PlexIcon(symbol: "message-circle-question-mark", size: 12.5, color: Plex.steel600)
                Text(items.count == 1 ? "One thing to check" : "Two things to check")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Plex.steel900)
            }
            ForEach(items, id: \.self) { q in
                VStack(alignment: .leading, spacing: 6) {
                    Text(q)
                        .font(.system(size: 13))
                        .foregroundStyle(Plex.steel900)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        MWTextField(placeholder: "Your answer", text: Binding(get: { answers[q] ?? "" }, set: { answers[q] = $0 })) {
                            compile(refining: true)
                        }
                        Button { compile(refining: true) } label: { PlexLabel("Update", icon: "rotate-cw") }
                            .mwButton(.secondary)
                            .disabled((answers[q] ?? "").trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
        .padding(14)
        .background(Plex.steel50, in: RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Plex.radiusMD, style: .continuous).strokeBorder(Plex.steel200))
    }

    // MARK: Footer

    private var footer: some View {
        HStack(spacing: 10) {
            if phase == .review {
                PlexIcon(symbol: "shield-check", size: 12, color: Plex.faint)
                Text("Money steps are checked against your pots every time it runs.")
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.muted)
            } else {
                Text("Plex turns it into steps you can check. Nothing runs until you save.")
                    .font(.system(size: 12))
                    .foregroundStyle(Plex.muted)
            }
            Spacer(minLength: 12)
            Button(phase == .review ? "Back" : "Cancel") {
                if phase == .review { phase = .describe } else { dismiss() }
            }
            .mwButton(.ghost)
            .keyboardShortcut(.cancelAction)
            if phase == .review {
                Button { save() } label: {
                    if saving {
                        HStack(spacing: 6) { ProgressView().controlSize(.mini).tint(.white); Text("Saving") }
                    } else {
                        PlexLabel(editingID == nil ? "Save routine" : "Save changes", icon: "check")
                    }
                }
                .mwButton(.primary)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(saving || (draft?.name.trimmingCharacters(in: .whitespaces).isEmpty ?? true))
            } else {
                Button { compile() } label: {
                    if phase == .compiling {
                        HStack(spacing: 6) { ProgressView().controlSize(.mini).tint(.white); Text("Reading it") }
                    } else {
                        Text("Compile")
                    }
                }
                .mwButton(.primary, arrow: phase != .compiling)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(phase == .compiling || prompt.trimmingCharacters(in: .whitespacesAndNewlines).count < 8)
            }
        }
        .padding(.horizontal, 24)
        .frame(height: 60)
        .background(Plex.surface.opacity(0.92))
        .overlay(alignment: .top) { MWDivider() }
    }

    // MARK: Actions

    private func compile(refining: Bool = false) {
        var text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        if refining {
            let extra = answers.compactMap { q, a -> String? in
                let a = a.trimmingCharacters(in: .whitespacesAndNewlines)
                return a.isEmpty ? nil : "\(q) \(a)"
            }
            if !extra.isEmpty { text += "\n" + extra.joined(separator: "\n") }
        }
        guard !text.isEmpty else { return }
        problem = nil
        phase = .compiling
        Task {
            do {
                let result = try await BrainAPI.compileRoutine(prompt: text)
                if refining { prompt = text }
                answers = [:]
                draft = result
                phase = .review
            } catch {
                problem = (error as? LocalizedError)?.errorDescription ?? "Plex couldn't read that. Try saying it another way."
                phase = draft != nil && refining ? .review : .describe
            }
        }
    }

    private func save() {
        guard let draft else { return }
        saving = true
        problem = nil
        Task {
            do {
                var args: [String: JSONValue] = [
                    "name": .string(draft.name.trimmingCharacters(in: .whitespaces)),
                    "prompt": .string(prompt.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "icon": .string(draft.icon),
                    "spec": draft.spec.raw,
                    "runWhere": .string(draft.runWhere),
                    "missed": .string(draft.missed),
                    "timezone": .string(TimeZone.current.identifier),
                ]
                if let editingID { args["routineId"] = .string(editingID) }
                let id: String = try await ConvexClient.shared.mutation("routines:save", args, as: String.self)
                saving = false
                model.section = .routines
                model.openRoutineID = id
                dismiss()
            } catch {
                saving = false
                problem = (error as? LocalizedError)?.errorDescription ?? "Couldn't save the routine."
            }
        }
    }
}

private struct ExampleChip: View {
    let text: String
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                PlexIcon(symbol: "corner-down-right", size: 10, color: hovering ? Plex.ink2 : Plex.faint)
                Text(text)
                    .font(.system(size: 12.5))
                    .foregroundStyle(hovering ? Plex.ink : Plex.ink2)
                    .lineLimit(1)
            }
            .padding(.horizontal, 13)
            .frame(height: 32)
            .background(hovering ? Plex.surface : Plex.surface.opacity(0.8), in: Capsule())
            .overlay(Capsule().strokeBorder(hovering ? Plex.ink.opacity(0.15) : Plex.ink.opacity(0.08)))
            .shadow(color: MWLook.shadow.opacity(0.7), radius: 6, y: 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

/// A thin line sweeping under the editor while Plex reads the routine.
private struct CompilingBar: View {
    @State private var phase: CGFloat = -0.4

    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(Plex.ink.opacity(0.55))
                .frame(width: geo.size.width * 0.35)
                .offset(x: geo.size.width * phase)
        }
        .clipped()
        .onAppear {
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: false)) { phase = 1.05 }
        }
    }
}
