import AppKit
import SwiftUI

// The main window's building blocks, mirroring apps/web/src/components/ui (Button, Badge, Amount,
// EmptyState, Skeleton, PageHeader). Prefixed MW so they never clash with the notch's views.

// MARK: Look

/// The window's soft extras on top of the Plex tokens: the aurora wash, the card shadow.
enum MWLook {
    /// Slice's card shadow: soft and low.
    static let shadow = Color(hex: 0x0C2426, opacity: 0.07)
    static let aqua = Color(hex: 0x7FE6EA)
    /// The sidebar's flat ground, a step below the canvas.
    static let sidebar = Color(hex: 0xF1F4F3)
    /// Freezes the aurora's drift (renders).
    nonisolated(unsafe) static var still = false

    /// The progress gradient for pots: mint into the signal green.
    static let barGradient = LinearGradient(colors: [Color(hex: 0x9AF8DE), Plex.green400, Plex.green500],
                                            startPoint: .leading, endPoint: .trailing)
    /// Mint → steel, for avatars and the flow's line.
    static let mintSteel = LinearGradient(colors: [Plex.green300, MWLook.aqua, Plex.steel300],
                                          startPoint: .topLeading, endPoint: .bottomTrailing)
}

/// A faint mint → aqua → steel wash that melts into the canvas, drifting slowly (Slice's sky, in Plex
/// colours). Kept pale on purpose: it tints the top of a page, it never competes with the content.
struct MWAurora: View {
    var base: Color = Plex.canvas
    var strength: Double = 1

    var body: some View {
        if MWLook.still {
            mesh(at: 0)
        } else {
            TimelineView(.animation(minimumInterval: 1 / 20)) { context in
                mesh(at: context.date.timeIntervalSinceReferenceDate)
            }
        }
    }

    private func mesh(at t: Double) -> some View {
        func wobble(_ phase: Double, _ amount: Float = 0.06) -> Float { Float(sin(t * 0.3 + phase)) * amount }
        let top: [UInt32] = [0xD9FAEF, 0xD6F4F4, 0xE4EBF4]
        let mid: [UInt32] = [0xEEFBF6, 0xEEF7F7, 0xF0F3F7]
        let colors = (top + mid).map { Color(hex: $0) } + [base, base, base]
        return MeshGradient(width: 3, height: 3, points: [
            [0, 0], [0.5 + wobble(0.3), 0], [1, 0],
            [0, 0.42 + wobble(1.2, 0.05)], [0.5 + wobble(2.1), 0.48 + wobble(0.7, 0.05)], [1, 0.4 + wobble(2.8, 0.05)],
            [0, 1], [0.5, 1], [1, 1],
        ], colors: colors)
        .opacity(strength)
    }
}

// MARK: Layout

/// A page in the detail column: scrolls, pads, keeps lines a readable length, and sits under the aurora.
struct MWPage<Content: View>: View {
    var maxWidth: CGFloat = 940
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) { content }
                .padding(.horizontal, 40)
                .padding(.top, 14)
                .padding(.bottom, 44)
                .frame(maxWidth: maxWidth, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.automatic)
        .background(alignment: .top) {
            MWAurora()
                .frame(height: 260)
                .ignoresSafeArea()
        }
        .background(Plex.canvas)
    }
}

struct MWPageHeader<Actions: View>: View {
    let title: String
    var icon: String?
    var subtitle: String?
    var tint: MWIconTile.Tint = .green
    @ViewBuilder var actions: Actions

    var body: some View {
        HStack(alignment: .top, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 14) {
                    if let icon { MWIconTile(symbol: icon, tint: tint, size: 38) }
                    Text(title)
                        .font(.system(size: 32, weight: .bold))
                        .tracking(-1)
                        .foregroundStyle(Plex.ink)
                }
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 14))
                        .foregroundStyle(Plex.ink2.opacity(0.85))
                        .lineSpacing(2.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: 580, alignment: .leading)
                }
            }
            Spacer(minLength: 12)
            HStack(spacing: 8) { actions }
                .padding(.top, 4)
        }
    }
}

extension MWPageHeader where Actions == EmptyView {
    init(title: String, icon: String? = nil, subtitle: String? = nil, tint: MWIconTile.Tint = .green) {
        self.init(title: title, icon: icon, subtitle: subtitle, tint: tint) { EmptyView() }
    }
}

/// A section's title over its content: "Coming up", "Bills 6".
struct MWSectionTitle<Trailing: View>: View {
    let title: String
    var count: Int?
    var icon: String?
    var tint: MWIconTile.Tint = .green
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            if let icon { MWIcon(symbol: icon, size: 15, color: MWIconTile.foreground(tint)) }
            Text(title)
                .font(.system(size: 17, weight: .bold))
                .tracking(-0.35)
                .foregroundStyle(Plex.ink)
            if let count {
                Text("\(count)")
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Plex.faint)
            }
            Spacer(minLength: 8)
            trailing
        }
    }
}

extension MWSectionTitle where Trailing == EmptyView {
    init(_ title: String, count: Int? = nil, icon: String? = nil, tint: MWIconTile.Tint = .green) {
        self.init(title: title, count: count, icon: icon, tint: tint) { EmptyView() }
    }
}

/// A white card holding rows divided by hairlines.
struct MWListCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .background(Plex.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Plex.ink.opacity(0.06)))
            .shadow(color: MWLook.shadow, radius: 14, y: 5)
    }
}

extension View {
    /// A white card: big radius, hairline, Slice's soft shadow.
    func mwCard(radius: CGFloat = 20, padding: CGFloat = 18) -> some View {
        self
            .padding(padding)
            .background(Plex.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Plex.ink.opacity(0.06)))
            .shadow(color: MWLook.shadow, radius: 14, y: 5)
    }
}

struct MWDivider: View {
    var inset: CGFloat = 0
    var body: some View {
        Rectangle().fill(Plex.ink.opacity(0.06)).frame(height: 1).padding(.leading, inset)
    }
}

// MARK: Icons

// The window has one icon set: Lucide, the web app's set, drawn from the vector assets in
// Assets > Lucide (`lucide-<name>`, made by scripts/lucide-icons.mjs). Two ways to show one:
//  - MWIcon: the bare line glyph, beside text (the sidebar, section titles, badges, buttons).
//  - MWIconTile: the glyph on a soft tile, where an icon stands for a thing (a page, a routine, a pot).
// Mint is the default; steel is for what's held, waiting or needs you.

/// A Lucide glyph. `size` matches a font size: the glyph's ink is about that tall.
struct MWIcon: View {
    let symbol: String
    var size: CGFloat = 13
    /// nil takes the surrounding foreground style (buttons, labels).
    var color: Color? = Plex.muted

    var body: some View {
        let image = Image(MWIcon.asset(symbol))
            .renderingMode(.template)
            .resizable()
            .interpolation(.high)
            .frame(width: size * 1.2, height: size * 1.2)
        if let color { image.foregroundStyle(color) } else { image }
    }

    /// The asset for a Lucide name, or a neutral fallback (logged in debug builds) when it's missing.
    static func asset(_ name: String) -> String {
        let key = "lucide-\(name)"
        if NSImage(named: key) != nil { return key }
        #if DEBUG
        print("[icons] missing Lucide icon \"\(name)\"; add it to scripts/lucide-icons.txt")
        #endif
        return "lucide-circle"
    }

    static func exists(_ name: String) -> Bool { NSImage(named: "lucide-\(name)") != nil }
}

/// A Lucide glyph on a soft tile: a mint (or steel) wash, a hairline, a white lip on top.
struct MWIconTile: View {
    enum Tint { case neutral, green, steel, amber, ink }
    let symbol: String
    var tint: Tint = .green
    var size: CGFloat = 30

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
        shape
            .fill(LinearGradient(colors: fill, startPoint: .top, endPoint: .bottom))
            .overlay(shape.strokeBorder(border, lineWidth: 1))
            .overlay(shape.inset(by: 1).strokeBorder(
                LinearGradient(colors: [.white.opacity(tint == .ink ? 0.12 : 0.9), .clear], startPoint: .top, endPoint: .center),
                lineWidth: 1))
            .overlay(MWIcon(symbol: symbol, size: size * 0.44, color: foreground))
            .frame(width: size, height: size)
            .shadow(color: shadow, radius: size * 0.1, y: size * 0.04)
    }

    private var fill: [Color] {
        switch tint {
        case .neutral: [Plex.surface, Plex.sunken]
        case .green: [Plex.green50, Plex.green100]
        case .steel: [Plex.steel50, Plex.steel100]
        case .amber: [Plex.refundedBg, Plex.refundedBg]
        case .ink: [Plex.ink2, Plex.ink]
        }
    }

    private var border: Color {
        switch tint {
        case .neutral: Plex.line
        case .green: Plex.green200.opacity(0.8)
        case .steel: Plex.steel200.opacity(0.8)
        case .amber: Plex.refunded.opacity(0.15)
        case .ink: .clear
        }
    }

    var foreground: Color { Self.foreground(tint) }

    static func foreground(_ tint: Tint) -> Color {
        switch tint {
        case .neutral: Plex.ink2
        case .green: Plex.green800
        case .steel: Plex.steel700
        case .amber: Plex.refunded
        case .ink: .white
        }
    }

    private var shadow: Color {
        switch tint {
        case .green: Plex.green700.opacity(0.10)
        case .steel: Plex.steel700.opacity(0.10)
        default: MWLook.shadow
        }
    }
}

/// A Label with a Lucide icon, for buttons ("New routine", "Run now").
struct MWLabel: View {
    let title: String
    let icon: String

    init(_ title: String, icon: String) {
        self.title = title
        self.icon = icon
    }

    var body: some View {
        Label { Text(title) } icon: { MWIcon(symbol: icon, size: 12, color: nil) }
    }
}

// MARK: Buttons

/// Plex's button roles in Slice's shape: capsules. Primary (ink) for the main action, with an arrow
/// badge when it moves you on; brand (green) only when money moves; secondary (white) and ghost for
/// the rest; danger for deleting.
struct MWButtonStyle: ButtonStyle {
    enum Kind { case primary, brand, secondary, ghost, danger }
    enum Size { case small, regular, large }

    var kind: Kind = .secondary
    var size: Size = .regular
    var arrow = false
    @Environment(\.isEnabled) private var isEnabled
    @State private var hovering = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 9) {
            configuration.label
                .font(.system(size: size == .large ? 14 : (size == .small ? 12.5 : 13), weight: .semibold))
                .labelStyle(MWButtonLabelStyle())
                .lineLimit(1)
            if arrow {
                MWIcon(symbol: "arrow-right", size: size == .large ? 11 : 10, color: nil)
                    .foregroundStyle(kind == .brand ? Plex.green700 : Plex.ink)
                    .frame(width: badge, height: badge)
                    .background(Circle().fill(.white))
            }
        }
        .padding(.leading, size == .small ? 12 : (size == .large ? 20 : 15))
        .padding(.trailing, arrow ? (height - badge) / 2 : (size == .small ? 12 : (size == .large ? 20 : 15)))
        .frame(height: height)
        .foregroundStyle(foreground)
        .background(background(pressed: configuration.isPressed), in: Capsule())
        .overlay {
            if kind == .secondary || kind == .danger {
                Capsule().strokeBorder(hovering ? Plex.ink.opacity(0.16) : Plex.ink.opacity(0.09))
            }
        }
        .overlay {
            if kind == .brand {
                Capsule()
                    .strokeBorder(Color.white.opacity(0.22), lineWidth: 1)
                    .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
            }
        }
        .shadow(color: shadow, radius: kind == .ghost ? 0 : 6, y: 2)
        .contentShape(Capsule())
        .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.4)
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: hovering)
        .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var height: CGFloat {
        switch size {
        case .small: 28
        case .regular: 32
        case .large: 40
        }
    }

    private var badge: CGFloat { size == .large ? 26 : 22 }

    private var foreground: Color {
        switch kind {
        case .primary: .white
        case .brand: Plex.ink
        case .secondary: Plex.ink
        case .ghost: hovering ? Plex.ink : Plex.ink2
        case .danger: Plex.disputed
        }
    }

    private func background(pressed: Bool) -> AnyShapeStyle {
        switch kind {
        case .primary: AnyShapeStyle(hovering ? Plex.ink2 : Plex.ink)
        case .brand: AnyShapeStyle(LinearGradient(colors: [hovering ? Plex.green300 : Plex.green300, hovering ? Plex.green400 : Plex.green500],
                                                  startPoint: .top, endPoint: .bottom))
        case .secondary: AnyShapeStyle(hovering ? Plex.canvas : Plex.surface)
        case .ghost: AnyShapeStyle(hovering || pressed ? Plex.ink.opacity(0.05) : Color.clear)
        case .danger: AnyShapeStyle(hovering ? Plex.disputedBg : Plex.surface)
        }
    }

    private var shadow: Color {
        switch kind {
        case .primary: Plex.ink.opacity(0.18)
        case .secondary, .danger: MWLook.shadow
        case .brand: Plex.green700.opacity(0.32)
        case .ghost: .clear
        }
    }
}

private struct MWButtonLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon.font(.system(size: 12, weight: .semibold))
            configuration.title
        }
    }
}

extension View {
    func mwButton(_ kind: MWButtonStyle.Kind = .secondary, size: MWButtonStyle.Size = .regular, arrow: Bool = false) -> some View {
        buttonStyle(MWButtonStyle(kind: kind, size: size, arrow: arrow))
    }
}

/// An icon-only button with a quiet hover fill.
struct MWIconButton: View {
    let symbol: String
    let help: String
    var color: Color = Plex.muted
    var size: CGFloat = 26
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            MWIcon(symbol: symbol, size: 12.5, color: hovering ? Plex.ink : color)
                .frame(width: size, height: size)
                .background(hovering ? Plex.sunken : .clear, in: RoundedRectangle(cornerRadius: Plex.radiusXS, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
        .onHover { hovering = $0 }
    }
}

// MARK: Badges, dots, chips

enum MWTone { case neutral, green, steel, amber, red, outline }

struct MWBadge: View {
    let text: String
    var tone: MWTone = .neutral
    var symbol: String?

    var body: some View {
        HStack(spacing: 4) {
            if let symbol { MWIcon(symbol: symbol, size: 9.5, color: nil) }
            Text(text).font(.system(size: 11.5, weight: .medium))
        }
        .lineLimit(1)
        .padding(.horizontal, 7)
        .frame(height: 20)
        .foregroundStyle(foreground)
        .background(background, in: Capsule())
        .overlay(Capsule().strokeBorder(ring, lineWidth: 1))
        .fixedSize()
    }

    private var foreground: Color {
        switch tone {
        case .neutral, .outline: Plex.ink2
        case .green: Plex.green700
        case .steel: Plex.steel700
        case .amber: Plex.refunded
        case .red: Plex.disputed
        }
    }

    private var background: Color {
        switch tone {
        case .neutral: Plex.sunken
        case .green: Plex.green50
        case .steel: Plex.steel50
        case .amber: Plex.refundedBg
        case .red: Plex.disputedBg
        case .outline: .clear
        }
    }

    private var ring: Color {
        switch tone {
        case .neutral: .clear
        case .green: Plex.green200.opacity(0.7)
        case .steel: Plex.steel200.opacity(0.7)
        case .amber: Plex.refunded.opacity(0.15)
        case .red: Plex.disputed.opacity(0.15)
        case .outline: Plex.line
        }
    }
}

struct MWDot: View {
    let color: Color
    var size: CGFloat = 7
    var body: some View {
        Circle().fill(color).frame(width: size, height: size)
    }
}

extension RunStatus {
    var color: Color {
        switch self {
        case .done: Plex.green500
        case .running, .queued: Plex.steel500
        case .waiting: Plex.steel400
        case .failed: Plex.disputed
        case .skipped, .cancelled, .other: Plex.faint
        }
    }

    var tone: MWTone {
        switch self {
        case .done: .green
        case .running, .queued, .waiting: .steel
        case .failed: .red
        case .skipped, .cancelled, .other: .neutral
        }
    }
}

/// A filter chip: "All", "Money", "Routines".
struct MWChip: View {
    let title: String
    var count: Int?
    let selected: Bool
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(title).font(.system(size: 12.5, weight: selected ? .semibold : .medium))
                if let count {
                    Text("\(count)").font(.system(size: 11.5, weight: .medium)).monospacedDigit().opacity(0.6)
                }
            }
            .padding(.horizontal, 13)
            .frame(height: 30)
            .foregroundStyle(selected ? Plex.green800 : (hovering ? Plex.ink : Plex.ink2))
            .background(selected ? Plex.green50 : (hovering ? Plex.canvas : Plex.surface), in: Capsule())
            .overlay(Capsule().strokeBorder(selected ? Plex.green400.opacity(0.6) : Plex.ink.opacity(0.08), lineWidth: selected ? 1.2 : 1))
            .shadow(color: selected ? .clear : MWLook.shadow.opacity(0.6), radius: 4, y: 1)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: selected)
    }
}

// MARK: Money

/// An amount: tabular digits, the currency sign a touch lighter (the web's `<Amount>`).
struct MWAmount: View {
    let cents: Int
    var size: CGFloat = 14
    var weight: Font.Weight = .semibold
    var sign: Sign?
    var color: Color = Plex.ink
    var whole = false

    enum Sign { case incoming, outgoing }

    var body: some View {
        let text = Money.format(abs(cents), whole: whole)
        let symbol = String(text.prefix { !$0.isNumber })
        let digits = String(text.dropFirst(symbol.count))
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            if let sign {
                Text(sign == .incoming ? "+" : "\u{2212}")
                    .foregroundStyle(sign == .incoming ? Plex.green600 : Plex.ink2)
                    .padding(.trailing, 1)
            }
            Text(symbol)
                .font(.system(size: size >= 24 ? size * 0.6 : size, weight: size >= 24 ? .medium : weight))
                .foregroundStyle(size >= 24 ? Plex.muted : color)
                .padding(.trailing, size >= 24 ? 1.5 : 0.5)
            Text(digits)
        }
        .font(.system(size: size, weight: weight))
        .tracking(size >= 22 ? -0.03 * size : 0)
        .monospacedDigit()
        .foregroundStyle(color)
        .fixedSize()
    }
}

/// Spent against budget as one track and one fill.
struct MWBar: View {
    let fraction: Double
    var color: Color = Plex.green400
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Plex.sunken)
                Capsule()
                    .fill(fraction > 1 ? AnyShapeStyle(Plex.disputed) : (color == Plex.green400 ? AnyShapeStyle(MWLook.barGradient) : AnyShapeStyle(color)))
                    .frame(width: max(height, geo.size.width * min(max(fraction, 0), 1)))
                    .opacity(fraction <= 0 ? 0 : 1)
            }
        }
        .frame(height: height)
    }
}

extension ReceiptState {
    var label: String {
        switch self {
        case .pending: "Pending"
        case .funded: "Funded"
        case .held: "Held"
        case .released: "Released"
        case .paid: "Paid"
        case .refunded: "Refunded"
        case .disputed: "Disputed"
        case .declined: "Declined"
        }
    }

    var tone: MWTone {
        switch self {
        case .pending, .declined: .neutral
        case .funded, .held: .steel
        case .released, .paid: .green
        case .refunded: .amber
        case .disputed: .red
        }
    }

    var symbol: String {
        switch self {
        case .pending, .declined: "circle-dashed"
        case .funded, .held: "lock"
        case .released, .paid: "check"
        case .refunded: "undo-2"
        case .disputed: "triangle-alert"
        }
    }
}

/// The web's ReceiptRow: who, why, the rule that allowed it, the amount and its state.
struct MWReceiptRow: View {
    let receipt: ReceiptDoc
    var showRule = true

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(receipt.isIncoming ? Plex.green50 : Plex.steel50)
                .overlay(MWIcon(symbol: receipt.isIncoming ? "arrow-down-left" : WindowFormat.receiptSymbol(receipt.kind), size: 12.5,
                                color: receipt.isIncoming ? Plex.green700 : Plex.steel600))
                .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 3) {
                Text(receipt.title)
                    .font(.system(size: 13.5, weight: .medium))
                    .foregroundStyle(Plex.ink)
                    .lineLimit(1)
                if !receipt.why.isEmpty, receipt.title != receipt.why {
                    Text("\u{201C}\(receipt.why)\u{201D}")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Plex.ink2)
                        .lineLimit(1)
                }
                HStack(spacing: 5) {
                    if showRule, !receipt.ruleText.isEmpty {
                        MWIcon(symbol: "shield-check", size: 10, color: nil)
                        Text(receipt.ruleText).lineLimit(1)
                        Text("\u{00B7}").foregroundStyle(Plex.faint)
                    } else {
                        Text(WindowFormat.receiptKindLabel(receipt.kind))
                        Text("\u{00B7}").foregroundStyle(Plex.faint)
                    }
                    Text(WindowFormat.relative(receipt.occurredAt)).fixedSize()
                }
                .font(.system(size: 12))
                .foregroundStyle(Plex.muted)
            }
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 5) {
                MWAmount(cents: receipt.amountCents, size: 13.5, sign: receipt.isIncoming ? .incoming : .outgoing)
                MWBadge(text: receipt.state.label, tone: receipt.state.tone, symbol: receipt.state.symbol)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }
}

// MARK: States: loading, empty, error

struct MWSkeleton: View {
    var width: CGFloat?
    var height: CGFloat = 12
    var radius: CGFloat = 4
    @State private var on = false

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Plex.sunken)
            .frame(width: width, height: height)
            .opacity(on ? 0.55 : 1)
            .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: on)
            .onAppear { on = true }
    }
}

/// Placeholder rows shaped like the real ones, in a card.
struct MWSkeletonRows: View {
    var count = 4
    var leading: CGFloat = 30

    var body: some View {
        MWListCard {
            ForEach(0..<count, id: \.self) { i in
                if i > 0 { MWDivider() }
                HStack(spacing: 12) {
                    MWSkeleton(width: leading, height: leading, radius: leading / 3)
                    VStack(alignment: .leading, spacing: 7) {
                        MWSkeleton(width: [180, 140, 210, 160][i % 4], height: 11)
                        MWSkeleton(width: [260, 200, 240, 120][i % 4], height: 9)
                    }
                    Spacer()
                    MWSkeleton(width: 54, height: 11)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
            }
        }
    }
}

struct MWEmptyState: View {
    let symbol: String
    let title: String
    let message: String
    var compact = false
    var icon: String?

    var body: some View {
        VStack(spacing: compact ? 8 : 12) {
            MWIconTile(symbol: icon ?? symbol, size: compact ? 44 : 60)
            VStack(spacing: 5) {
                Text(title)
                    .font(.system(size: compact ? 14 : 16, weight: .bold))
                    .tracking(-0.2)
                    .foregroundStyle(Plex.ink)
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(Plex.muted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(1.5)
                    .frame(maxWidth: 360)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, compact ? 22 : 40)
        .padding(.horizontal, 20)
        .background(alignment: .top) {
            MWAurora(base: Plex.surface, strength: 0.75).frame(height: compact ? 90 : 150)
        }
        .background(Plex.surface)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Plex.ink.opacity(0.06)))
        .shadow(color: MWLook.shadow, radius: 14, y: 5)
    }
}

/// A quiet inline problem: "Can't reach Convex at …". Never a blank page.
struct MWBanner: View {
    let message: String
    var symbol = "triangle-alert"
    var tone: MWTone = .amber
    var action: (title: String, run: () -> Void)?

    var body: some View {
        HStack(spacing: 10) {
            MWIcon(symbol: symbol, size: 12.5, color: foreground)
            Text(message)
                .font(.system(size: 12.5))
                .foregroundStyle(foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if let action {
                Button(action.title, action: action.run)
                    .buttonStyle(.plain)
                    .font(.system(size: 12.5, weight: .medium))
                    .foregroundStyle(foreground)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(background, in: RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous).strokeBorder(foreground.opacity(0.14)))
    }

    private var foreground: Color {
        switch tone {
        case .red: Plex.disputed
        case .steel: Plex.steel700
        case .green: Plex.green700
        case .neutral, .outline: Plex.ink2
        case .amber: Plex.refunded
        }
    }

    private var background: Color {
        switch tone {
        case .red: Plex.disputedBg
        case .steel: Plex.steel50
        case .green: Plex.green50
        case .neutral, .outline: Plex.sunken
        case .amber: Plex.refundedBg
        }
    }
}

/// A live query's error, if any, as a banner.
struct MWQueryBanner<T: Decodable>: View {
    let query: LiveQuery<T>

    var body: some View {
        if let error = query.error {
            MWBanner(message: error.message, symbol: error.kind == .unreachable ? "wifi-off" : "triangle-alert")
        }
    }
}

// MARK: Fields

/// A rounded search field with a magnifier.
struct MWSearchField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 7) {
            MWIcon(symbol: "search", size: 12, color: Plex.faint)
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
            if !text.isEmpty {
                Button { text = "" } label: {
                    MWIcon(symbol: "circle-x", size: 12, color: nil).foregroundStyle(Plex.faint)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(Plex.surface, in: RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous).strokeBorder(Plex.line))
    }
}

/// A plain text field on a white rounded box.
struct MWTextField: View {
    let placeholder: String
    @Binding var text: String
    var monospaced = false
    var onSubmit: () -> Void = {}

    var body: some View {
        TextField(placeholder, text: $text)
            .textFieldStyle(.plain)
            .font(monospaced ? .system(size: 12.5, design: .monospaced) : .system(size: 13))
            .padding(.horizontal, 10)
            .frame(height: 30)
            .background(Plex.surface, in: RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Plex.radiusSM, style: .continuous).strokeBorder(Plex.line))
            .onSubmit(onSubmit)
    }
}

/// The window's switch: ink, so green keeps meaning money moved.
struct MWSwitch: View {
    @Binding var isOn: Bool
    var body: some View {
        Toggle("", isOn: $isOn)
            .toggleStyle(.switch)
            .controlSize(.mini)
            .tint(Plex.green500)
            .labelsHidden()
    }
}
