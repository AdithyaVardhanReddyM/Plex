import AppKit
import Foundation

/// Words and symbols for the main window: times, triggers, icons.
enum WindowFormat {
    // MARK: Time

    static func relative(_ date: Date, now: Date = .now) -> String {
        let seconds = date.timeIntervalSince(now)
        if abs(seconds) < 45 { return seconds >= 0 ? "in a moment" : "just now" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        f.dateTimeStyle = .named
        return f.localizedString(for: date, relativeTo: now)
    }

    /// "8:30 AM"
    static func time(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }

    /// "Nov 8"
    static func shortDate(_ date: Date) -> String {
        date.formatted(.dateTime.month(.abbreviated).day())
    }

    /// "Today", "Tomorrow", "Yesterday", or "Mon, Nov 9".
    static func day(_ date: Date, now: Date = .now) -> String {
        let cal = Calendar.current
        if cal.isDate(date, inSameDayAs: now) { return "Today" }
        if let t = cal.date(byAdding: .day, value: 1, to: now), cal.isDate(date, inSameDayAs: t) { return "Tomorrow" }
        if let y = cal.date(byAdding: .day, value: -1, to: now), cal.isDate(date, inSameDayAs: y) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }

    /// For grouping a feed: "Today", "Yesterday", "Wednesday, November 4".
    static func dayHeading(_ date: Date, now: Date = .now) -> String {
        let cal = Calendar.current
        if cal.isDate(date, inSameDayAs: now) { return "Today" }
        if let y = cal.date(byAdding: .day, value: -1, to: now), cal.isDate(date, inSameDayAs: y) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.wide).month(.wide).day())
    }

    /// "Due in 3 days", "Due tomorrow", "Due today", "2 days overdue".
    static func due(_ date: Date, now: Date = .now) -> String {
        let cal = Calendar.current
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: date)).day ?? 0
        switch days {
        case 0: return "Due today"
        case 1: return "Due tomorrow"
        case 2...13: return "Due in \(days) days"
        case ..<0: return days == -1 ? "1 day overdue" : "\(-days) days overdue"
        default: return "Due \(shortDate(date))"
        }
    }

    /// "4s", "1m 12s", "3m"
    static func duration(_ seconds: TimeInterval) -> String {
        let s = Int(seconds.rounded())
        if s < 60 { return "\(max(s, 1))s" }
        let m = s / 60, r = s % 60
        if m < 60 { return r == 0 || m >= 10 ? "\(m)m" : "\(m)m \(r)s" }
        return "\(m / 60)h \(m % 60)m"
    }

    static func greeting(now: Date = .now) -> String {
        switch Calendar.current.component(.hour, from: now) {
        case 5..<12: "Good morning"
        case 12..<17: "Good afternoon"
        default: "Good evening"
        }
    }

    // MARK: Triggers

    /// "Every Friday at 6:00 PM", "When an email from Comcast arrives".
    static func trigger(_ trigger: RoutineTrigger) -> String {
        switch trigger {
        case let .schedule(cadence, time, days, dayOfMonth, everyHours, at):
            let clock = time.flatMap(clockTime).map { " at \($0)" } ?? ""
            switch cadence {
            case "hourly":
                if let n = everyHours, n > 1 { return "Every \(n) hours" }
                return "Every hour"
            case "daily":
                return "Every day\(clock)"
            case "weekly":
                return "Every \(weekdays(days))\(clock)"
            case "monthly":
                let d = dayOfMonth ?? 1
                return "On the \(ordinal(d)) of every month\(clock)"
            case "once":
                if let at { return "Once, \(at.formatted(.dateTime.month(.abbreviated).day())) at \(Self.time(at))" }
                return "Once\(clock)"
            default:
                return "On a schedule\(clock)"
            }
        case let .email(_, label):
            return phrase(label, prefix: "email", fallback: "When an email arrives") { "When an \($0) arrives" }
        case let .paypal(event, label):
            if !label.isEmpty { return label.lowercased().hasPrefix("when") ? label : "When \(lowerFirst(label))" }
            return event.isEmpty ? "When something happens in PayPal" : "When PayPal sends \(event)"
        case let .folder(path, _, label):
            if !label.isEmpty { return label.lowercased().hasPrefix("when") ? label : "When \(lowerFirst(label))" }
            return "When a file lands in \((path as NSString).lastPathComponent)"
        case .manual:
            return "When you run it"
        case let .other(label):
            return label
        }
    }

    static func triggerGlossy(_ trigger: RoutineTrigger) -> String {
        switch trigger {
        case .schedule: "plex-mint-calendar"
        case .email: "plex-mint-chat"
        case .paypal: "plex-money-card"
        case .folder: "plex-mint-folder"
        case .manual: "plex-mint-cursor"
        case .other: "plex-mint-orb"
        }
    }

    /// A routine's glossy icon: from its own icon name when there's a match, else from its trigger.
    static func routineGlossy(_ icon: String, trigger: RoutineTrigger, money: Bool) -> String {
        switch icon.lowercased() {
        case "home", "house", "hand-coins", "coins", "send", "split", "users", "arrow-right-left": return "plex-money-hand"
        case "piggy-bank", "banknote", "wallet", "dollar-sign", "credit-card": return "plex-money-card"
        case "receipt", "file-text", "zap", "bolt", "lightbulb", "plug": return "plex-money-receipt"
        case "repeat", "refresh-cw", "trending-up": return "plex-money-loop"
        case "calendar", "calendar-clock", "clock", "sun": return "plex-mint-calendar"
        case "mail", "inbox", "bell", "bell-ring": return "plex-mint-chat"
        case "shield", "shield-check": return "plex-mint-shield"
        case "shopping-bag", "shopping-cart", "gift": return "plex-mint-bag"
        case "folder": return "plex-mint-folder"
        case "map-pin": return "plex-mint-pin"
        default: return money ? "plex-money-hand" : triggerGlossy(trigger)
        }
    }

    static func triggerSymbol(_ trigger: RoutineTrigger) -> String {
        switch trigger {
        case .schedule: "clock"
        case .email: "envelope"
        case .paypal: "dollarsign.circle"
        case .folder: "folder"
        case .manual: "hand.tap"
        case .other: "bolt"
        }
    }

    private static func phrase(_ label: String, prefix: String, fallback: String, _ make: (String) -> String) -> String {
        let trimmed = label.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return fallback }
        if trimmed.lowercased().hasPrefix("when") { return trimmed }
        if trimmed.lowercased().hasPrefix(prefix) { return make(lowerFirst(trimmed)) }
        return "When \(lowerFirst(trimmed))"
    }

    private static func lowerFirst(_ s: String) -> String {
        guard let first = s.first else { return s }
        // Keep proper nouns and acronyms ("PayPal", "Comcast") as they are.
        let word = s.split(separator: " ").first.map(String.init) ?? s
        if word.count > 1, word.dropFirst().contains(where: \.isUppercase) { return s }
        return first.lowercased() + s.dropFirst()
    }

    /// "18:00" → "6:00 PM"
    static func clockTime(_ hhmm: String) -> String? {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2, (0..<24).contains(parts[0]), (0..<60).contains(parts[1]) else { return nil }
        var c = DateComponents()
        c.hour = parts[0]
        c.minute = parts[1]
        guard let date = Calendar.current.date(from: c) else { return nil }
        return time(date)
    }

    private static let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    static func weekdays(_ days: [Int]) -> String {
        let set = Set(days.filter { (0...6).contains($0) })
        if set.isEmpty || set.count == 7 { return "day" }
        if set == [1, 2, 3, 4, 5] { return "weekday" }
        if set == [0, 6] { return "weekend" }
        let names = set.sorted().map { dayNames[$0] }
        if names.count == 1 { return names[0] }
        return names.dropLast().joined(separator: ", ") + " and " + names.last!
    }

    static func ordinal(_ n: Int) -> String {
        let suffix: String
        switch (n % 100, n % 10) {
        case (11...13, _): suffix = "th"
        case (_, 1): suffix = "st"
        case (_, 2): suffix = "nd"
        case (_, 3): suffix = "rd"
        default: suffix = "th"
        }
        return "\(n)\(suffix)"
    }

    // MARK: Symbols

    /// A lucide-style icon name from Convex → an SF Symbol that exists on this Mac.
    static func symbol(_ lucide: String, fallback: String = "arrow.triangle.2.circlepath") -> String {
        let map: [String: String] = [
            "home": "house", "house": "house", "calendar": "calendar", "calendar-clock": "calendar.badge.clock",
            "repeat": "repeat", "refresh-cw": "arrow.triangle.2.circlepath", "zap": "bolt", "bolt": "bolt",
            "mail": "envelope", "inbox": "tray", "receipt": "doc.plaintext", "file-text": "doc.text", "file": "doc",
            "wallet": "wallet.bifold", "piggy-bank": "banknote", "banknote": "banknote", "credit-card": "creditcard",
            "dollar-sign": "dollarsign.circle", "hand-coins": "dollarsign.circle", "coins": "dollarsign.circle",
            "bell": "bell", "bell-ring": "bell", "shield": "shield", "shield-check": "checkmark.shield",
            "trending-up": "chart.line.uptrend.xyaxis", "chart": "chart.bar", "bar-chart": "chart.bar",
            "coffee": "cup.and.saucer", "utensils": "fork.knife", "shopping-bag": "bag", "shopping-cart": "cart",
            "map-pin": "mappin.and.ellipse", "plane": "airplane", "car": "car", "gift": "gift", "heart": "heart",
            "users": "person.2", "user": "person", "send": "paperplane", "arrow-right-left": "arrow.left.arrow.right",
            "split": "arrow.triangle.branch", "folder": "folder", "lightbulb": "lightbulb", "plug": "powerplug",
            "wifi": "wifi", "phone": "phone", "smartphone": "iphone", "tv": "tv", "music": "music.note",
            "dumbbell": "dumbbell", "key": "key", "clock": "clock", "sun": "sun.max", "moon": "moon",
            "briefcase": "briefcase", "building": "building.2", "landmark": "building.columns", "tag": "tag",
            "scissors": "scissors", "check": "checkmark.circle", "list-checks": "checklist", "sparkle": "star",
        ]
        let candidate = map[lucide.lowercased()] ?? lucide
        if NSImage(systemSymbolName: candidate, accessibilityDescription: nil) != nil { return candidate }
        return fallback
    }

    static func potSymbol(_ icon: String) -> String { symbol(icon, fallback: "circle.grid.2x2") }

    static func stepSymbol(_ kind: StepKind) -> String {
        switch kind {
        case .check: "checklist"
        case .act: "cursorarrow.click.2"
        case .money: "dollarsign.circle"
        case .notify: "bell"
        case .ask: "person.crop.circle.badge.questionmark"
        case .wait: "hourglass"
        case .other: "circle"
        }
    }

    static func activitySymbol(_ kind: ActivityKind) -> String {
        switch kind {
        case .voice: "waveform"
        case .task: "checklist"
        case .routine: "arrow.triangle.2.circlepath"
        case .money: "dollarsign.circle"
        case .memory: "text.book.closed"
        case .handoff: "person.crop.circle.badge.exclamationmark"
        case .system: "gearshape"
        }
    }

    static func runStepSymbol(_ kind: String) -> String {
        switch kind {
        case "tool": "wrench.and.screwdriver"
        case "money": "dollarsign.circle"
        case "ask": "person.crop.circle.badge.questionmark"
        case "done": "checkmark.circle"
        case "error": "exclamationmark.triangle"
        default: "circle.fill"
        }
    }

    static func memorySymbol(_ kind: MemoryKind) -> String {
        switch kind {
        case .fact: "info.circle"
        case .preference: "slider.horizontal.3"
        case .person: "person"
        case .merchant: "storefront"
        case .habit: "repeat"
        case .note: "note.text"
        }
    }

    static func receiptSymbol(_ kind: String) -> String {
        switch kind {
        case "task_funding": "dollarsign.circle"
        case "payout": "arrow.up.right"
        case "refund": "arrow.uturn.backward"
        case "donation": "heart"
        case "purchase": "bag"
        case "invoice": "doc.text"
        case "subscription": "repeat"
        default: "doc.plaintext"
        }
    }

    static func receiptKindLabel(_ kind: String) -> String {
        switch kind {
        case "task_funding": "Task funding"
        case "payout": "Payout"
        case "refund": "Refund"
        case "donation": "Donation"
        case "purchase": "Purchase"
        case "invoice": "Invoice"
        case "subscription": "Subscription"
        case "bill": "Bill"
        default: kind.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}
