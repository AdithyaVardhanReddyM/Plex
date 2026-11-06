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

    static func triggerIcon(_ trigger: RoutineTrigger) -> String {
        switch trigger {
        case .schedule: "calendar-clock"
        case .email: "mail"
        case .paypal: "wallet"
        case .folder: "folder"
        case .manual: "play"
        case .other: "zap"
        }
    }


    /// A routine's icon: its own Lucide icon when Plex has it, else its trigger's.
    static func routineIcon(_ icon: String, trigger: RoutineTrigger, money: Bool) -> String {
        let own = symbol(icon, fallback: "")
        if !own.isEmpty { return own }
        return money ? "hand-coins" : triggerIcon(trigger)
    }

    static func triggerSymbol(_ trigger: RoutineTrigger) -> String {
        switch trigger {
        case .schedule: "clock"
        case .email: "mail"
        case .paypal: "circle-dollar-sign"
        case .folder: "folder"
        case .manual: "pointer"
        case .other: "zap"
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

    /// An icon name from Convex (Lucide, as on the web) → a Lucide icon Plex for Mac has, through a few
    /// aliases for older or looser names.
    static func symbol(_ name: String, fallback: String = "refresh-cw") -> String {
        let aliases: [String: String] = [
            "home": "house", "bolt": "zap", "chart": "chart-column", "bar-chart": "chart-column",
            "bar-chart-3": "chart-column", "check": "circle-check", "sparkle": "star", "sparkles": "star",
            "dollar": "circle-dollar-sign", "dollar-sign": "circle-dollar-sign", "money": "banknote",
        ]
        let key = name.lowercased().trimmingCharacters(in: .whitespaces)
        let candidate = aliases[key] ?? key
        if !candidate.isEmpty, PlexIcon.exists(candidate) { return candidate }
        return fallback
    }

    static func potSymbol(_ icon: String) -> String { symbol(icon, fallback: "wallet") }

    static func stepSymbol(_ kind: StepKind) -> String {
        switch kind {
        case .check: "list-checks"
        case .act: "mouse-pointer-click"
        case .money: "circle-dollar-sign"
        case .notify: "bell"
        case .ask: "message-circle-question-mark"
        case .wait: "hourglass"
        case .other: "circle"
        }
    }

    static func activitySymbol(_ kind: ActivityKind) -> String {
        switch kind {
        case .voice: "audio-waveform"
        case .task: "list-checks"
        case .routine: "refresh-cw"
        case .money: "circle-dollar-sign"
        case .memory: "brain"
        case .handoff: "circle-user-round"
        case .system: "settings"
        }
    }

    static func runStepSymbol(_ kind: String) -> String {
        switch kind {
        case "tool": "wrench"
        case "money": "circle-dollar-sign"
        case "ask": "message-circle-question-mark"
        case "done": "circle-check"
        case "error": "triangle-alert"
        default: "circle-dot"
        }
    }

    static func memorySymbol(_ kind: MemoryKind) -> String {
        switch kind {
        case .fact: "info"
        case .preference: "sliders-horizontal"
        case .person: "user"
        case .merchant: "store"
        case .habit: "repeat"
        case .note: "sticky-note"
        }
    }

    static func receiptSymbol(_ kind: String) -> String {
        switch kind {
        case "task_funding": "circle-dollar-sign"
        case "payout": "arrow-up-right"
        case "refund": "undo-2"
        case "donation": "heart"
        case "purchase": "shopping-bag"
        case "invoice": "file-text"
        case "subscription": "repeat"
        default: "receipt"
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
