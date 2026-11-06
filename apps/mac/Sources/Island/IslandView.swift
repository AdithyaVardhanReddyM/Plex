import SwiftUI

extension EnvironmentValues {
    /// Drawing for -renderIsland: AppKit text fields draw as placeholders instead.
    @Entry var islandRendering = false
}

/// Where the main window can open (AppDelegate maps these onto the window's sections).
enum WindowPlace { case today, needsYou, insights, connections, settings }

/// What the island's buttons do outside the island (set by AppDelegate, which owns the main window).
@MainActor
enum IslandActions {
    static var openMainWindow: (WindowPlace) -> Void = { _ in }
}

struct IslandView: View {
    @Bindable var model: IslandModel

    var body: some View {
        let mode = model.mode
        let size = model.size(mode)
        let width = size.width + 2 * IslandModel.shoulder

        ZStack(alignment: .top) {
            IslandShell(shape: NotchShape(shoulder: IslandModel.shoulder, bottomRadius: Self.radius(mode)), height: size.height,
                        solidTop: max(model.notch.height, 26) + 2, glass: mode != .closed && mode != .compact, rendering: model.rendering)
                .shadow(color: .black.opacity(mode == .open || mode == .receipt ? 0.35 : 0), radius: 18, y: 10)

            // Light round the edge while Plex listens or thinks, and for a moment when money moves.
            if Self.glows(mode), model.agent.phase != .idle || mode == .receipt {
                GlowRing(shape: NotchShape(shoulder: IslandModel.shoulder, bottomRadius: Self.radius(mode)),
                         solidTop: max(model.notch.height, 26), listening: model.agent.phase == .listening,
                         still: model.rendering)
                    .frame(width: width, height: size.height)
                    .transition(.opacity)
            }

            content(mode)
                .padding(.horizontal, IslandModel.shoulder)
                .frame(width: width, height: size.height, alignment: .top)
                .clipShape(NotchShape(shoulder: IslandModel.shoulder, bottomRadius: Self.radius(mode)))
        }
        .frame(width: width, height: size.height)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .animation(.spring(response: 0.3, dampingFraction: 0.86), value: mode)
        .environment(\.colorScheme, .dark)
        .environment(\.islandRendering, model.rendering)
    }

    private static func glows(_ mode: IslandModel.Mode) -> Bool {
        mode == .compact || mode == .captioned || mode == .open || mode == .receipt
    }

    private static func radius(_ mode: IslandModel.Mode) -> CGFloat {
        switch mode {
        case .closed: 10
        case .compact: 12
        case .captioned, .pill, .drop: 20
        case .receipt: 24
        case .open: 26
        }
    }

    @ViewBuilder
    private func content(_ mode: IslandModel.Mode) -> some View {
        switch mode {
        case .closed:
            Color.clear
        case .compact:
            Ears(model: model)
                .transition(.opacity)
        case .captioned:
            VStack(spacing: 0) {
                Ears(model: model)
                Caption(text: model.captionText ?? "", isError: model.agent.lastError != nil)
            }
            .transition(.opacity)
        case .pill:
            VStack(spacing: 0) {
                Ears(model: model)
                if let pill = model.agent.pill { PillLine(pill: pill) }
            }
            .transition(.opacity)
        case .receipt:
            VStack(spacing: 0) {
                Ears(model: model)
                if let receipt = model.agent.receipt {
                    ReceiptCard(receipt: receipt)
                        .padding(.horizontal, 12)
                        .padding(.top, 2)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .transition(.opacity)
        case .drop:
            VStack(spacing: 0) {
                Ears(model: model)
                DropHint()
            }
            .transition(.opacity)
        case .open:
            OpenIsland(model: model)
                .transition(.opacity)
        }
    }
}

/// One quiet line under the notch: a routine ran on its own. Hover to open the island.
struct PillLine: View {
    let pill: AgentSession.Pill

    var body: some View {
        HStack(spacing: 9) {
            if pill.symbol.hasPrefix("checkmark") {
                GlowDot(size: 8, steel: !pill.moved)
                    .frame(width: 14)
            } else {
                Image(systemName: pill.symbol)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(IslandStyle.accent)
            }
            Text(pill.text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(IslandStyle.text)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.top, 2)
        .padding(.bottom, 12)
    }
}

/// While a file is dragged over the notch.
private struct DropHint: View {
    var body: some View {
        HStack(spacing: 12) {
            GlossyIcon("plex-mint-folder")
                .frame(width: 34, height: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text("Drop to hand it to Plex")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(IslandStyle.text)
                Text("Bills, receipts and invoices, as PDFs or pictures")
                    .font(.system(size: 12))
                    .foregroundStyle(IslandStyle.text2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(IslandGlow.ring.opacity(0.7), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4]))
        )
        .padding(.horizontal, 12)
        .padding(.top, 4)
    }
}

/// The notch row: the wordmark on the left, what the agent is doing on the right.
private struct Ears: View {
    let model: IslandModel

    var body: some View {
        HStack(spacing: 0) {
            Wordmark(size: 12, color: .white)
                .frame(width: IslandModel.ear)
            Spacer(minLength: model.notch.width)
            StatusGlyph(agent: model.agent)
                .frame(width: IslandModel.ear)
        }
        .padding(.horizontal, 4)
        .frame(height: max(model.notch.height, 26))
    }
}

private struct Caption: View {
    let text: String
    let isError: Bool

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(isError ? IslandStyle.bad : IslandStyle.text)
            .lineLimit(2)
            .truncationMode(.head)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.top, 2)
            .padding(.bottom, 12)
            .contentTransition(.opacity)
    }
}

/// Live bars while listening or speaking, a slow wave while thinking; at rest, the Needs you
/// count when something waits, else a dot for the connection.
struct StatusGlyph: View {
    let agent: AgentSession

    var body: some View {
        switch agent.phase {
        case .listening:
            Bars(level: { _ in Double(agent.micLevel) })
        case .speaking:
            Bars(level: { t in 0.35 + 0.35 * sin(t * 9) })
        case .thinking:
            Bars(level: { t in 0.18 + 0.12 * sin(t * 4) }, spread: 1.2)
        case .idle:
            if agent.asksCount > 0 {
                Text("\(agent.asksCount)")
                    .font(.system(size: 11, weight: .bold).monospacedDigit())
                    .foregroundStyle(Plex.steel900)
                    .frame(minWidth: 18, minHeight: 18)
                    .padding(.horizontal, agent.asksCount > 9 ? 4 : 0)
                    .background(Capsule().fill(IslandStyle.accent))
                    .help("\(agent.asksCount) waiting for you")
            } else {
                if agent.connection == .online {
                    GlowDot(size: 7)
                } else {
                    Circle().fill(Color.white.opacity(0.3)).frame(width: 6, height: 6)
                }
            }
        }
    }
}

struct Bars: View {
    /// Loudness 0…1 at a time, before each bar's own offset.
    let level: (Double) -> Double
    var spread: Double = 0.7
    var style: AnyShapeStyle = AnyShapeStyle(LinearGradient(colors: [Color(hex: 0x9AF8DE), Color(hex: 0x6FE3E6), Color(hex: 0x9CB4D2)],
                                                            startPoint: .top, endPoint: .bottom))

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            HStack(spacing: 2.5) {
                ForEach(0..<5, id: \.self) { i in
                    let wobble = 0.55 + 0.45 * sin(t * 7 + Double(i) * spread)
                    let h = max(0.15, min(1, level(t + Double(i) * 0.08) * wobble * 1.6))
                    Capsule()
                        .fill(style)
                        .frame(width: 2.5, height: 4 + 12 * h)
                }
            }
            .frame(height: 16)
        }
    }
}

// MARK: Open

private struct OpenIsland: View {
    @Bindable var model: IslandModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 10) {
            header
            if model.hasCards {
                // Cards scroll on their own so the conversation always keeps a few lines.
                let cards = VStack(spacing: 8) {
                    if let receipt = model.agent.receipt { ReceiptCard(receipt: receipt) }
                    TasksArea(agent: model.agent)
                }
                if model.rendering {
                    cards.frame(maxHeight: 440, alignment: .top)
                } else {
                    ScrollView { cards }
                        .scrollIndicators(.never)
                        .frame(maxHeight: 440)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                TasksArea(agent: model.agent)
            }
            Conversation(agent: model.agent, plain: model.rendering)
                .frame(minHeight: 40, maxHeight: .infinity)
            input
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .onAppear { focused = model.agent.droppedFile != nil }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Wordmark(size: 13, color: .white)
                .padding(.leading, 4)
            Spacer(minLength: model.notch.width + 16)
            StatusGlyph(agent: model.agent)
                .frame(width: 26)
            IconButton(symbol: "square.and.pencil", help: "New conversation") { model.agent.reset() }
            IconButton(symbol: "macwindow", help: "Open Plex") {
                IslandActions.openMainWindow(model.agent.asksCount > 0 ? .needsYou : .today)
            }
        }
        .frame(height: max(model.notch.height, 26))
    }

    private var input: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let file = model.agent.droppedFile {
                FileChip(url: file) { model.agent.clearDrop() }
            }
            HStack(spacing: 10) {
                let prompt = model.agent.droppedFile == nil ? "Ask Plex to pay, check or sort something" : "What should Plex do with it?"
                if model.rendering {
                    // ImageRenderer can't draw an AppKit text field.
                    Text(prompt).font(.system(size: 14)).foregroundStyle(IslandStyle.text3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    TextField(prompt, text: $model.draft)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14))
                        .foregroundStyle(.white)
                        .focused($focused)
                        .onSubmit(submit)
                }
                if model.agent.droppedFile != nil {
                    Button("Send", action: submit)
                        .buttonStyle(IslandButtonStyle(.primary))
                } else {
                    HStack(spacing: 4) {
                        Text("Hold")
                        KeyCap(label: "fn")
                        KeyCap(label: "⌃")
                        Text("to talk")
                    }
                    .font(.system(size: 11))
                    .foregroundStyle(IslandStyle.text3)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(IslandStyle.card))
    }

    private func submit() {
        model.agent.send(text: model.draft)
        model.draft = ""
    }
}

/// A dropped file waiting by the text field.
private struct FileChip: View {
    let url: URL
    let remove: () -> Void

    private var isImage: Bool {
        ["png", "jpg", "jpeg", "heic", "gif", "tiff", "webp"].contains(url.pathExtension.lowercased())
    }

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: isImage ? "photo" : "doc.text")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(IslandStyle.accent)
            Text(url.lastPathComponent)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(IslandStyle.text)
                .lineLimit(1)
                .truncationMode(.middle)
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(IslandStyle.text3)
                    .frame(width: 16, height: 16)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Remove")
        }
        .padding(.leading, 9)
        .padding(.trailing, 5)
        .frame(height: 28)
        .background(Capsule().fill(IslandStyle.raised))
    }
}

private struct Conversation: View {
    let agent: AgentSession
    var plain = false

    var body: some View {
        if plain {
            turns.frame(maxHeight: .infinity, alignment: agent.turns.isEmpty ? .top : .bottom)
        } else {
            scrolling
        }
    }

    private var turns: some View {
        VStack(alignment: .leading, spacing: 10) {
            if agent.turns.isEmpty {
                Text(agent.droppedFile == nil
                     ? "Ask Plex to pay a bill, check a subscription, split a receipt, or set up a routine."
                     : "Plex can read it, pay it, split it, or file it away. Say what you'd like.")
                    .font(.system(size: 13))
                    .foregroundStyle(IslandStyle.text3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 4)
            }
            let lastUser = agent.turns.lastIndex { $0.role == .user }
            ForEach(Array(agent.turns.enumerated()), id: \.element.id) { index, turn in
                TurnRow(turn: turn)
                if index == lastUser {
                    ForEach(agent.activities) { IslandActivityRow(activity: $0) }
                }
            }
        }
    }

    private var scrolling: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    turns
                    if let error = agent.lastError {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(IslandStyle.bad)
                    }
                    Color.clear.frame(height: 1).id("end")
                }
            }
            .scrollIndicators(.never)
            .onChange(of: agent.turns.last?.text) { proxy.scrollTo("end", anchor: .bottom) }
            .onChange(of: agent.activities.count) { proxy.scrollTo("end", anchor: .bottom) }
        }
    }
}

private struct TurnRow: View {
    let turn: AgentSession.Turn

    var body: some View {
        switch turn.role {
        case .user:
            HStack {
                Spacer(minLength: 60)
                Text(turn.text)
                    .font(.system(size: 13))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(IslandStyle.raised))
            }
        case .agent:
            Text(turn.text)
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.95))
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
    }
}

private struct IslandActivityRow: View {
    let activity: AgentSession.Activity

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(IslandStyle.text3)
                .frame(width: 16)
            Text(activity.label)
                .foregroundStyle(IslandStyle.text2)
            if let detail = activity.detail {
                Text(detail)
                    .foregroundStyle(IslandStyle.text3)
                    .lineLimit(1)
            }
        }
        .font(.system(size: 12))
    }

    private var symbol: String {
        switch activity.kind {
        case "money": "creditcard"
        case "mail": "envelope"
        case "memory": "brain"
        case "mac": "macwindow"
        case "browser": "globe"
        default: "wrench.and.screwdriver"
        }
    }
}

struct IconButton: View {
    let symbol: String
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(IslandStyle.text2)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

private struct KeyCap: View {
    let label: String

    var body: some View {
        Text(label)
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(.white.opacity(0.75))
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 16)
            .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(.white.opacity(0.12)))
    }
}

/// Light round the island's edge while Plex listens, thinks or talks: mint, aqua and steel turning
/// slowly, a crisp line with a soft glow. The top (where it meets the notch) stays dark.
private struct GlowRing: View {
    let shape: NotchShape
    let solidTop: CGFloat
    let listening: Bool
    var still = false

    var body: some View {
        if still {
            ring(0)
        } else {
            TimelineView(.animation(minimumInterval: 1 / 30)) { context in
                ring(context.date.timeIntervalSinceReferenceDate)
            }
        }
    }

    private func ring(_ t: Double) -> some View {
        let gradient = AngularGradient(colors: [
            Color(hex: 0x3EE0D8), Color(hex: 0x6FE3E6), Color(hex: 0xC4D3E6), Color(hex: 0x7393BD), Color(hex: 0x6EF3D6), Color(hex: 0x3EE0D8),
        ], center: .center, angle: .degrees(t * (listening ? 90 : 50)))
        return GeometryReader { geo in
            let h = max(geo.size.height, 1)
            // Tall: dark where it meets the notch. Compact (just the bar): light along the bottom half.
            let start = h > solidTop + 20 ? solidTop / h : 0.4
            let full = h > solidTop + 20 ? min(0.98, (solidTop + 18) / h) : 0.85
            let fade = LinearGradient(stops: [
                .init(color: .clear, location: 0),
                .init(color: .clear, location: start),
                .init(color: .black, location: full),
                .init(color: .black, location: 1),
            ], startPoint: .top, endPoint: .bottom)
            ZStack {
                shape.stroke(gradient, lineWidth: 6).blur(radius: 8).opacity(listening ? 0.75 : 0.5)
                shape.stroke(gradient, lineWidth: 1.2).opacity(0.95)
            }
            .mask(fade)
        }
        .allowsHitTesting(false)
    }
}

/// A tiny glowing dot in Plex's gradient: online, or a routine that ran.
struct GlowDot: View {
    var size: CGFloat = 7
    var steel = false

    var body: some View {
        let colors = steel ? [Color(hex: 0xE1E9F3), Color(hex: 0x9CB4D2)] : [Color(hex: 0xC6FCE5), Color(hex: 0x3EE0D8)]
        Circle()
            .fill(RadialGradient(colors: colors, center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: size))
            .frame(width: size, height: size)
            .shadow(color: (steel ? Color(hex: 0x9CB4D2) : Color(hex: 0x3EE0D8)).opacity(0.9), radius: size * 0.6)
    }
}
