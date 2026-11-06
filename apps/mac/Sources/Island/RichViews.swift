import AppKit
import SwiftUI

/// The rich cards a task can carry (the brain's `show_view`): a day's plan, a note to copy,
/// a file Plex made, or a row of options.
struct TaskViewCard: View {
    let view: TaskView
    let agent: AgentSession
    /// The task's own title, so a card with the same one doesn't say it twice.
    var taskTitle: String?

    var body: some View {
        switch view.type {
        case "timeline": TimelineCard(view: view, showTitle: view.title != taskTitle)
        case "note": NoteCard(view: view)
        case "file": FileCard(view: view)
        case "insights": InsightsCard(view: view)
        case "cards", "gifts", "options":
            VStack(alignment: .leading, spacing: 8) {
                if let title = view.title, title != taskTitle { CardHeading(symbol: "square.grid.2x2", text: title) }
                PicksRow(cards: view.cards ?? [])
            }
        default: EmptyView()
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (index, point) in arrange(bounds.width, subviews).points.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (points: [CGPoint], size: CGSize) {
        var points: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += row + spacing
                row = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return (points, CGSize(width: widest, height: y + row))
    }
}

struct CardHeading: View {
    let symbol: String
    let text: String

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white.opacity(0.75))
            .lineLimit(1)
    }
}

// MARK: Timeline

private struct TimelineCard: View {
    let view: TaskView
    var showTitle = true

    private var stops: [TaskView.Stop] { view.stops ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if showTitle, let title = view.title {
                CardHeading(symbol: "calendar", text: title)
            }
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in
                    StopRow(index: index, stop: stop, last: index == stops.count - 1)
                }
            }
        }
    }
}

private struct StopRow: View {
    let index: Int
    let stop: TaskView.Stop
    let last: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(stop.time ?? "")
                .font(.system(size: 12, weight: .semibold).monospacedDigit())
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, alignment: .leading)
            VStack(spacing: 0) {
                Text("\(index + 1)")
                    .font(.system(size: 9.5, weight: .heavy))
                    .foregroundStyle(.black)
                    .frame(width: 17, height: 17)
                    .background(Circle().fill(.white))
                if !last {
                    Rectangle().fill(.white.opacity(0.18)).frame(width: 1.5).frame(maxHeight: .infinity)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: Self.symbol(stop.kind))
                        .font(.system(size: 10.5))
                        .foregroundStyle(.white.opacity(0.55))
                    Text(stop.title)
                        .font(.system(size: 12.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                }
                if let line = subline {
                    Text(line)
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
            }
            .padding(.bottom, last ? 0 : 9)
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var subline: String? {
        var bits: [String] = []
        if let walk = stop.walkMin, walk > 0 { bits.append("\(walk) min walk") }
        if let with = stop.with { bits.append("with \(with)") }
        if let note = stop.note, !note.isEmpty { bits.append(note) }
        return bits.isEmpty ? nil : bits.joined(separator: ", ")
    }

    static func symbol(_ kind: String?) -> String {
        switch kind ?? "" {
        case "coffee", "cafe": "cup.and.saucer"
        case "bakery": "birthday.cake"
        case "record_store": "opticaldisc"
        case "bookstore": "book"
        case "museum": "building.columns"
        case "park": "leaf"
        case "restaurant", "dinner", "lunch": "fork.knife"
        case "bar", "cocktail_bar", "wine_bar": "wineglass"
        case "music_venue", "show", "concert", "jazz_club": "music.mic"
        case "cinema": "film"
        case "home": "house"
        case "flight": "airplane"
        case "hotel": "bed.double"
        case "calendar", "meeting": "calendar"
        default: "mappin"
        }
    }
}

// MARK: Note and file

private struct NoteCard: View {
    let view: TaskView
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                CardHeading(symbol: "text.quote", text: view.title ?? "Note")
                Spacer()
                Button(copied ? "Copied" : "Copy") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(view.text ?? "", forType: .string)
                    copied = true
                }
                .buttonStyle(IslandButtonStyle(.secondary))
            }
            Text(view.text ?? "")
                .font(.system(size: 13))
                .foregroundStyle(.white.opacity(0.92))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            if let detail = view.detail {
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
    }
}

private struct FileCard: View {
    let view: TaskView

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.richtext")
                .font(.system(size: 22))
                .foregroundStyle(IslandStyle.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(view.title ?? "File")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                if let detail = view.detail {
                    Text(detail)
                        .font(.system(size: 11.5))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
            Spacer()
            if let raw = view.path {
                let path = (raw as NSString).expandingTildeInPath
                Button("Show") { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
                    .buttonStyle(IslandButtonStyle(.secondary))
                Button("Open") { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }
                    .buttonStyle(IslandButtonStyle(.primary))
            }
        }
    }
}

/// Plex built a page of charts (show_insights): open it in the main window's Insights.
private struct InsightsCard: View {
    let view: TaskView

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 20))
                .foregroundStyle(IslandStyle.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(view.title ?? "Insights")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                Text("In Insights")
                    .font(.system(size: 11.5))
                    .foregroundStyle(.white.opacity(0.55))
            }
            Spacer()
            Button("Open") { IslandActions.openMainWindow(.insights) }
                .buttonStyle(IslandButtonStyle(.primary))
        }
    }
}

// MARK: Images

/// A remote picture with an in-memory cache (AsyncImage refetches whenever the island redraws,
/// and draws nothing in ImageRenderer; -renderIsland prefetches these instead).
struct RemoteImage: View {
    let url: String?
    /// Show the whole picture (a logo) instead of filling the frame.
    var fit = false
    @State private var image: NSImage?

    var body: some View {
        ZStack {
            if !fit { Rectangle().fill(Color.primary.opacity(0.07)) }
            if let image = image ?? url.flatMap(ImageCache.cached) {
                if fit {
                    Image(nsImage: image).resizable().interpolation(.high).scaledToFit()
                } else {
                    Image(nsImage: image).resizable().scaledToFill()
                }
            }
        }
        .task(id: url) {
            if let url { image = await ImageCache.load(url) }
        }
    }
}

@MainActor
enum ImageCache {
    private static var images: [String: NSImage] = [:]

    static func cached(_ url: String) -> NSImage? { images[url] }

    static func load(_ link: String) async -> NSImage? {
        if let hit = images[link] { return hit }
        guard let url = URL(string: link), let (data, _) = try? await URLSession.shared.data(from: url),
              let image = NSImage(data: data) else { return nil }
        images[link] = image
        return image
    }
}
