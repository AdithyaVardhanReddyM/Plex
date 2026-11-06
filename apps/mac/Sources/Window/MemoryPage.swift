import SwiftUI

/// What Plex knows about you (`memory:list`): search, filter by kind, edit inline, pin, forget.
struct MemoryPage: View {
    @State private var memories = LiveQuery<[MemoryDoc]>("memory:list")
    @State private var search = ""
    @State private var kind: MemoryKind?
    @State private var forgetting: MemoryDoc?
    /// Edits show at once; Convex catches up on the next poll.
    @State private var hidden: Set<String> = []

    var body: some View {
        MWPage(maxWidth: 860) {
            MWPageHeader(title: "Memory",
                         icon: "brain",
                         subtitle: "What Plex knows about you. It uses these to act like you would. Edit or forget anything.") {
                MWSearchField(placeholder: "Search memories", text: $search)
                    .frame(width: 220)
            }
            HStack(spacing: 6) {
                MWChip(title: "All", count: memories.value.map { visible($0).count }, selected: kind == nil) { kind = nil }
                ForEach(MemoryKind.allCases, id: \.self) { k in
                    let count = memories.value.map { visible($0).filter { $0.kind == k }.count } ?? 0
                    if count > 0 || kind == k {
                        MWChip(title: k.plural, count: count, selected: kind == k) { kind = k }
                    }
                }
            }
            MWQueryBanner(query: memories)

            if let list = memories.value {
                let shown = filtered(list)
                if list.isEmpty {
                    MWEmptyState(symbol: "brain", title: "Plex doesn't know you yet",
                                 message: "Tell it things (\u{201C}my landlord is Sam Okafor\u{201D}) and it learns from what you do. Everything it keeps shows up here.")
                } else if shown.isEmpty {
                    MWEmptyState(symbol: "search", title: "No memories match", message: "Try another word, or show all kinds.", compact: true)
                } else {
                    let pinned = shown.filter(\.pinned)
                    let rest = shown.filter { !$0.pinned }
                    if !pinned.isEmpty { group("Pinned", pinned, note: "Always in Plex's mind") }
                    if !rest.isEmpty { group(pinned.isEmpty ? nil : "Everything else", rest, note: nil) }
                }
            } else if !memories.settled {
                MWSkeletonRows(count: 6, leading: 28)
            }
        }
        .task { await memories.run() }
        .confirmationDialog("Forget this?", isPresented: Binding(get: { forgetting != nil }, set: { if !$0 { forgetting = nil } }),
                            presenting: forgetting) { memory in
            Button("Forget", role: .destructive) { forget(memory) }
            Button("Cancel", role: .cancel) {}
        } message: { memory in
            Text("Plex stops using \u{201C}\(memory.text)\u{201D}. It may learn it again if it comes up.")
        }
    }

    private func visible(_ list: [MemoryDoc]) -> [MemoryDoc] { list.filter { !hidden.contains($0.id) } }

    private func filtered(_ list: [MemoryDoc]) -> [MemoryDoc] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return list.filter { m in
            if hidden.contains(m.id) { return false }
            if let kind, m.kind != kind { return false }
            if !q.isEmpty, !"\(m.text) \(m.about ?? "") \(m.kind.label)".lowercased().contains(q) { return false }
            return true
        }
    }

    @ViewBuilder private func group(_ title: String?, _ items: [MemoryDoc], note: String?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                MWSectionTitle(title: title, count: items.count, icon: title == "Pinned" ? "map-pin" : nil) {
                    if let note { Text(note).font(.system(size: 12)).foregroundStyle(Plex.faint) }
                }
            }
            MWListCard {
                ForEach(items.indices, id: \.self) { i in
                    if i > 0 { MWDivider(inset: 54) }
                    MemoryRow(memory: items[i], save: { text in update(items[i], ["text": .string(text)]) },
                              pin: { update(items[i], ["pinned": .bool(!items[i].pinned)]) },
                              forget: { forgetting = items[i] })
                }
            }
        }
    }

    private func update(_ memory: MemoryDoc, _ fields: [String: JSONValue]) {
        var args = fields
        args["memoryId"] = .string(memory.id)
        Task {
            _ = try? await ConvexClient.shared.mutation("memory:update", args)
            await memories.refresh()
        }
    }

    private func forget(_ memory: MemoryDoc) {
        hidden.insert(memory.id)
        Task {
            do {
                try await ConvexClient.shared.mutation("memory:forget", ["memoryId": .string(memory.id)])
            } catch {
                hidden.remove(memory.id)
            }
            await memories.refresh()
        }
    }
}

struct MemoryRow: View {
    let memory: MemoryDoc
    let save: (String) -> Void
    let pin: () -> Void
    let forget: () -> Void

    @State private var editing = false
    @State private var draft = ""
    @State private var hovering = false
    @FocusState private var focused: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PlexIconTile(symbol: WindowFormat.memorySymbol(memory.kind), size: 28)
            VStack(alignment: .leading, spacing: 6) {
                if editing {
                    TextField("", text: $draft, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Plex.ink)
                        .focused($focused)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Plex.surface, in: RoundedRectangle(cornerRadius: Plex.radiusXS, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Plex.radiusXS, style: .continuous).strokeBorder(Plex.ink.opacity(0.3), lineWidth: 1.5))
                        .padding(.horizontal, -8)
                        .padding(.vertical, -6)
                        .onSubmit(commit)
                        .onExitCommand { editing = false }
                        .onChange(of: focused) { _, now in if !now, editing { commit() } }
                } else {
                    Text(memory.text)
                        .font(.system(size: 13.5))
                        .foregroundStyle(Plex.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .onTapGesture(count: 2) { startEditing() }
                }
                HStack(spacing: 6) {
                    if let about = memory.about {
                        MWBadge(text: about, tone: .outline, symbol: memory.kind == .merchant ? "store" : (memory.kind == .person ? "user" : "tag"))
                    }
                    MWBadge(text: memory.sourceLabel, tone: memory.source == "said" ? .neutral : .outline)
                    Text(usage)
                        .font(.system(size: 11.5))
                        .foregroundStyle(Plex.faint)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 2) {
                MWIconButton(symbol: memory.pinned ? "pin" : "pin", help: memory.pinned ? "Unpin" : "Pin: always keep this in mind",
                             color: memory.pinned ? Plex.ink : Plex.faint, action: pin)
                MWIconButton(symbol: "pencil", help: "Edit", color: Plex.faint) { startEditing() }
                MWIconButton(symbol: "trash-2", help: "Forget", color: Plex.faint, action: forget)
            }
            .opacity(hovering || memory.pinned || editing ? 1 : 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(hovering ? Plex.canvas.opacity(0.6) : .clear)
        .onHover { hovering = $0 }
    }

    private var usage: String {
        var parts: [String] = []
        parts.append(memory.uses == 0 ? "Not used yet" : (memory.uses == 1 ? "Used once" : "Used \(memory.uses) times"))
        if let last = memory.lastUsedAt { parts.append("last \(WindowFormat.relative(last))") }
        return parts.joined(separator: ", ")
    }

    private func startEditing() {
        draft = memory.text
        editing = true
        focused = true
    }

    private func commit() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        editing = false
        if !text.isEmpty, text != memory.text { save(text) }
    }
}
