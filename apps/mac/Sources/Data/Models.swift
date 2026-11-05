import Foundation

// The main window's view of Convex rows (packages/backend/convex/schema.ts, docs/plex-mac.md §2).
//
// Every model decodes through `DocFields`, which never throws: a missing field gets a default and an
// unknown enum value falls back to `.other`, so one odd row never blanks a page. Convex sends `_id`,
// `_creationTime` and numbers as JSON doubles; money is integer cents, times are ms since 1970.

// MARK: Reading JSON leniently

/// A JSON object read field by field, with defaults.
struct DocFields {
    let raw: JSONValue

    init(_ raw: JSONValue) { self.raw = raw }

    init(from decoder: Decoder) throws { raw = try JSONValue(from: decoder) }

    subscript(_ key: String) -> JSONValue? {
        if case .object(let o) = raw, let v = o[key], v != .null { return v }
        return nil
    }

    func str(_ key: String) -> String? {
        switch self[key] {
        case .string(let s): s
        case .number(let n): n.rounded() == n ? String(Int(n)) : String(n)
        case .bool(let b): String(b)
        default: nil
        }
    }

    func num(_ key: String) -> Double? {
        switch self[key] {
        case .number(let n): n
        case .string(let s): Double(s)
        default: nil
        }
    }

    func int(_ key: String) -> Int? {
        guard let n = num(key), n.isFinite else { return nil }
        return Int(n.rounded())
    }

    func bool(_ key: String) -> Bool? {
        switch self[key] {
        case .bool(let b): b
        case .number(let n): n != 0
        default: nil
        }
    }

    /// A time in ms since 1970.
    func date(_ key: String) -> Date? {
        num(key).map { Date(timeIntervalSince1970: $0 / 1000) }
    }

    func list(_ key: String) -> [JSONValue] {
        if case .array(let a) = self[key] { return a }
        return []
    }

    func strings(_ key: String) -> [String] {
        list(key).compactMap { if case .string(let s) = $0 { s } else { nil } }
    }

    func ints(_ key: String) -> [Int] {
        list(key).compactMap { if case .number(let n) = $0 { Int(n) } else { nil } }
    }

    func sub(_ key: String) -> DocFields { DocFields(self[key] ?? .null) }

    var id: String { str("_id") ?? UUID().uuidString }
    var created: Date { date("_creationTime") ?? .distantPast }
}

/// A model built from a JSON object; Decodable for free and never failing.
protocol LenientDoc: Decodable {
    init(_ f: DocFields)
}

extension LenientDoc {
    init(from decoder: Decoder) throws { self.init(try DocFields(from: decoder)) }
    init(json: JSONValue) { self.init(DocFields(json)) }
}

/// A string enum that keeps unknown values instead of failing.
protocol LenientEnum: RawRepresentable, Hashable, Sendable where RawValue == String {
    static var fallback: Self { get }
}

extension LenientEnum {
    init(_ raw: String?) { self = raw.flatMap(Self.init(rawValue:)) ?? .fallback }
}

// MARK: Asks (the human hand-off inbox)

enum AskKind: String, LenientEnum {
    case approval, question, takeover, login, other
    static var fallback: AskKind { .other }
}

struct AskDoc: LenientDoc, Identifiable, Hashable {
    let id: String
    let kind: AskKind
    let title: String
    let detail: String?
    let options: [String]
    let amountCents: Int?
    let payee: String?
    let ruleText: String?
    let potName: String?
    let sourceKind: String
    let sourceLabel: String
    let status: String
    let createdAt: Date

    init(_ f: DocFields) {
        id = f.id
        kind = AskKind(f.str("kind"))
        title = f.str("title") ?? "Plex needs you"
        detail = f.str("detail")
        options = f.strings("options")
        amountCents = f.int("amountCents")
        payee = f.str("payee")
        ruleText = f.str("ruleText")
        potName = f.str("potName")
        let source = f.sub("source")
        sourceKind = source.str("kind") ?? "task"
        sourceLabel = source.str("label") ?? ""
        status = f.str("status") ?? "pending"
        createdAt = f.date("createdAt") ?? f.created
    }

    var isMoney: Bool { kind == .approval && amountCents != nil }

    /// "From routine: Pay rent", "From a voice request", "From a task: Book a cleaner".
    var sourceLine: String {
        let label = sourceLabel.trimmingCharacters(in: .whitespaces)
        switch sourceKind {
        case "routine": return label.isEmpty ? "From a routine" : "From routine: \(label)"
        case "voice": return label.isEmpty ? "From something you said" : "From what you said: \(label)"
        default: return label.isEmpty ? "From a task" : "From task: \(label)"
        }
    }
}

// MARK: Routines

enum RunStatus: String, LenientEnum {
    case queued, running, waiting, done, failed, skipped, cancelled, other
    static var fallback: RunStatus { .other }

    var label: String {
        switch self {
        case .queued: "Queued"
        case .running: "Running"
        case .waiting: "Waiting on you"
        case .done: "Done"
        case .failed: "Failed"
        case .skipped: "Skipped"
        case .cancelled: "Cancelled"
        case .other: "Unknown"
        }
    }
}

enum RoutineTrigger: Hashable {
    case schedule(cadence: String, time: String?, days: [Int], dayOfMonth: Int?, everyHours: Int?, at: Date?)
    case email(query: String, label: String)
    case paypal(event: String, label: String)
    case folder(path: String, pattern: String?, label: String)
    case manual
    case other(String)

    init(_ f: DocFields) {
        switch f.str("kind") {
        case "schedule":
            self = .schedule(cadence: f.str("cadence") ?? "daily", time: f.str("time"), days: f.ints("days"),
                             dayOfMonth: f.int("dayOfMonth"), everyHours: f.int("everyHours"), at: f.date("at"))
        case "email": self = .email(query: f.str("query") ?? "", label: f.str("label") ?? "")
        case "paypal": self = .paypal(event: f.str("event") ?? "", label: f.str("label") ?? "")
        case "folder": self = .folder(path: f.str("path") ?? "", pattern: f.str("pattern"), label: f.str("label") ?? "")
        case "manual", nil: self = .manual
        case let other?: self = .other(f.str("label") ?? other)
        }
    }
}

enum StepKind: String, LenientEnum {
    case check, act, money, notify, ask, wait, other
    static var fallback: StepKind { .other }
}

struct RoutineStep: Hashable, Identifiable {
    let id: String
    let kind: StepKind
    let title: String
    let detail: String?
    let tool: String?
}

struct RoutineSpec: Hashable {
    struct Condition: Hashable { let text: String; let check: String? }
    struct Guardrails: Hashable {
        let potName: String?
        let maxSpendCents: Int?
        let approval: String // "always" | "over_limit" | "never_money"
    }

    let trigger: RoutineTrigger
    let conditions: [Condition]
    let steps: [RoutineStep]
    let guardrails: Guardrails
    let summary: String
    /// The spec as it came, sent back unchanged on save.
    let raw: JSONValue

    init(_ f: DocFields) {
        raw = f.raw
        trigger = RoutineTrigger(f.sub("trigger"))
        conditions = f.list("conditions").map { c in
            let c = DocFields(c)
            return Condition(text: c.str("text") ?? "", check: c.str("check"))
        }.filter { !$0.text.isEmpty }
        steps = f.list("steps").enumerated().map { i, s in
            let s = DocFields(s)
            return RoutineStep(id: s.str("id") ?? "s\(i)", kind: StepKind(s.str("kind")), title: s.str("title") ?? "Step \(i + 1)",
                               detail: s.str("detail"), tool: s.str("tool"))
        }
        let g = f.sub("guardrails")
        guardrails = Guardrails(potName: g.str("potName"), maxSpendCents: g.int("maxSpendCents"), approval: g.str("approval") ?? "over_limit")
        summary = f.str("summary") ?? ""
    }

    var movesMoney: Bool { steps.contains { $0.kind == .money } }

    static func == (a: RoutineSpec, b: RoutineSpec) -> Bool { a.raw == b.raw }
    func hash(into hasher: inout Hasher) {
        hasher.combine(trigger)
        hasher.combine(steps)
        hasher.combine(summary)
    }
}

struct RoutineDoc: LenientDoc, Identifiable, Hashable {
    struct LastRun: Hashable { let status: RunStatus; let summary: String?; let startedAt: Date? }

    let id: String
    let name: String
    let prompt: String
    let icon: String
    let spec: RoutineSpec
    let runWhere: String // "mac" | "cloud"
    let missed: String // "run_on_wake" | "skip"
    let timezone: String
    let enabled: Bool
    let nextRunAt: Date?
    let lastRunAt: Date?
    let lastStatus: RunStatus?
    let lastSummary: String?
    let createdAt: Date
    let lastRun: LastRun?

    init(_ f: DocFields) {
        id = f.id
        name = f.str("name") ?? "Untitled routine"
        prompt = f.str("prompt") ?? ""
        icon = f.str("icon") ?? "repeat"
        spec = RoutineSpec(f.sub("spec"))
        runWhere = f.str("runWhere") ?? "cloud"
        missed = f.str("missed") ?? "run_on_wake"
        timezone = f.str("timezone") ?? TimeZone.current.identifier
        enabled = f.bool("enabled") ?? true
        nextRunAt = f.date("nextRunAt")
        lastRunAt = f.date("lastRunAt")
        lastStatus = f.str("lastStatus").map { RunStatus($0) }
        lastSummary = f.str("lastSummary")
        createdAt = f.date("createdAt") ?? f.created
        let last = f.sub("lastRun")
        if last.raw != .null {
            lastRun = LastRun(status: RunStatus(last.str("status")), summary: last.str("summary"), startedAt: last.date("startedAt"))
        } else if let status = lastStatus {
            lastRun = LastRun(status: status, summary: lastSummary, startedAt: lastRunAt)
        } else {
            lastRun = nil
        }
    }
}

struct RunDoc: LenientDoc, Identifiable, Hashable {
    struct Step: Hashable, Identifiable {
        let id: Int
        let at: Date?
        let kind: String // info | tool | money | ask | done | error
        let label: String
        let detail: String?
    }

    let id: String
    let routineId: String
    let status: RunStatus
    let reason: String
    let startedAt: Date
    let endedAt: Date?
    let steps: [Step]
    let summary: String?
    let receiptIds: [String]
    let askId: String?

    init(_ f: DocFields) {
        id = f.id
        routineId = f.str("routineId") ?? ""
        status = RunStatus(f.str("status"))
        reason = f.str("reason") ?? "Ran"
        startedAt = f.date("startedAt") ?? f.created
        endedAt = f.date("endedAt")
        steps = f.list("steps").enumerated().map { i, s in
            let s = DocFields(s)
            return Step(id: i, at: s.date("at"), kind: s.str("kind") ?? "info", label: s.str("label") ?? "", detail: s.str("detail"))
        }
        summary = f.str("summary")
        receiptIds = f.strings("receiptIds")
        askId = f.str("askId")
    }

    var duration: TimeInterval? { endedAt.map { $0.timeIntervalSince(startedAt) } }
}

/// `routines:get`
struct RoutineDetailDoc: LenientDoc {
    let routine: RoutineDoc?
    let runs: [RunDoc]

    init(_ f: DocFields) {
        let r = f.sub("routine")
        routine = r.raw == .null ? nil : RoutineDoc(r)
        runs = f.list("runs").map { RunDoc(json: $0) }
    }
}

/// What `POST /mac/routines/compile` sends back: a routine to review before saving.
struct RoutineDraft: LenientDoc, Hashable {
    var name: String
    let icon: String
    let spec: RoutineSpec
    var runWhere: String
    var missed: String
    let questions: [String]

    init(_ f: DocFields) {
        name = f.str("name") ?? "New routine"
        icon = f.str("icon") ?? "repeat"
        spec = RoutineSpec(f.sub("spec"))
        runWhere = f.str("runWhere") ?? "cloud"
        missed = f.str("missed") ?? "run_on_wake"
        questions = f.strings("questions")
    }

    init(routine: RoutineDoc, questions: [String] = []) {
        name = routine.name
        icon = routine.icon
        spec = routine.spec
        runWhere = routine.runWhere
        missed = routine.missed
        self.questions = questions
    }
}

// MARK: Memory

enum MemoryKind: String, LenientEnum, CaseIterable {
    case fact, preference, person, merchant, habit, note
    static var fallback: MemoryKind { .note }

    var label: String {
        switch self {
        case .fact: "Fact"
        case .preference: "Preference"
        case .person: "Person"
        case .merchant: "Merchant"
        case .habit: "Habit"
        case .note: "Note"
        }
    }

    var plural: String {
        switch self {
        case .fact: "Facts"
        case .preference: "Preferences"
        case .person: "People"
        case .merchant: "Merchants"
        case .habit: "Habits"
        case .note: "Notes"
        }
    }
}

struct MemoryDoc: LenientDoc, Identifiable, Hashable {
    let id: String
    let kind: MemoryKind
    let text: String
    let about: String?
    let source: String // said | learned | email | routine | settings
    let confidence: Double
    let pinned: Bool
    let uses: Int
    let lastUsedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    init(_ f: DocFields) {
        id = f.id
        kind = MemoryKind(f.str("kind"))
        text = f.str("text") ?? ""
        about = f.str("about").flatMap { $0.isEmpty ? nil : $0 }
        source = f.str("source") ?? "learned"
        confidence = f.num("confidence") ?? 1
        pinned = f.bool("pinned") ?? false
        uses = f.int("uses") ?? 0
        lastUsedAt = f.date("lastUsedAt")
        createdAt = f.date("createdAt") ?? f.created
        updatedAt = f.date("updatedAt") ?? createdAt
    }

    var sourceLabel: String {
        switch source {
        case "said": "You said"
        case "learned": "Learned"
        case "email": "From email"
        case "routine": "From a routine"
        case "settings": "From settings"
        default: source.capitalized
        }
    }
}

// MARK: Money

struct BillDoc: LenientDoc, Identifiable, Hashable {
    let id: String
    let payee: String
    let payeeEmail: String?
    let category: String
    let amountCents: Int
    let dueAt: Date
    let status: String // upcoming | paid | overdue | scheduled
    let autopay: Bool
    let source: String
    let note: String?
    let usualCents: Int?
    let receiptId: String?
    let paidAt: Date?

    init(_ f: DocFields) {
        id = f.id
        payee = f.str("payee") ?? "Bill"
        payeeEmail = f.str("payeeEmail")
        category = f.str("category") ?? "Bills"
        amountCents = f.int("amountCents") ?? 0
        dueAt = f.date("dueAt") ?? .distantFuture
        status = f.str("status") ?? "upcoming"
        autopay = f.bool("autopay") ?? false
        source = f.str("source") ?? "manual"
        note = f.str("note")
        usualCents = f.int("usualCents")
        receiptId = f.str("receiptId")
        paidAt = f.date("paidAt")
    }

    /// More than 30% above the usual amount.
    var isSpike: Bool {
        guard let usual = usualCents, usual > 0 else { return false }
        return Double(amountCents) > Double(usual) * 1.3
    }

    var spikePercent: Int {
        guard let usual = usualCents, usual > 0 else { return 0 }
        return Int(((Double(amountCents) / Double(usual)) - 1) * 100)
    }
}

struct SubscriptionDoc: LenientDoc, Identifiable, Hashable {
    let id: String
    let merchant: String
    let plan: String
    let amountCents: Int
    let cadence: String // monthly | yearly
    let nextChargeAt: Date?
    let status: String // active | cancelled | paused
    let lastUsedAt: Date?
    let previousAmountCents: Int?
    let category: String

    init(_ f: DocFields) {
        id = f.id
        merchant = f.str("merchant") ?? "Subscription"
        plan = f.str("plan") ?? ""
        amountCents = f.int("amountCents") ?? 0
        cadence = f.str("cadence") ?? "monthly"
        nextChargeAt = f.date("nextChargeAt")
        status = f.str("status") ?? "active"
        lastUsedAt = f.date("lastUsedAt")
        previousAmountCents = f.int("previousAmountCents")
        category = f.str("category") ?? ""
    }

    var priceWentUp: Bool { (previousAmountCents ?? .max) < amountCents }

    func unusedDays(now: Date = .now) -> Int? {
        guard let last = lastUsedAt else { return nil }
        return Int(now.timeIntervalSince(last) / 86_400)
    }
}

struct PotDoc: LenientDoc, Identifiable, Hashable {
    let id: String
    let name: String
    let icon: String
    let color: String
    let balanceCents: Int
    let spentMonthCents: Int
    let monthlyBudgetCents: Int
    let rulesText: String
    let ruleLines: [String]

    init(_ f: DocFields) {
        id = f.str("_id") ?? f.str("name") ?? UUID().uuidString
        name = f.str("name") ?? "Pot"
        icon = f.str("icon") ?? "wallet"
        color = f.str("color") ?? "green"
        balanceCents = f.int("balanceCents") ?? 0
        spentMonthCents = f.int("spentMonthCents") ?? 0
        monthlyBudgetCents = f.int("monthlyBudgetCents") ?? 0
        rulesText = f.str("rulesText") ?? ""
        ruleLines = f.strings("ruleLines")
    }

    /// Spent this month over the budget, 0…1 (can pass 1).
    var spentFraction: Double {
        monthlyBudgetCents > 0 ? Double(spentMonthCents) / Double(monthlyBudgetCents) : 0
    }
}

enum ReceiptState: String, LenientEnum {
    case pending, funded, held, released, paid, refunded, disputed, declined
    static var fallback: ReceiptState { .pending }
}

struct ReceiptDoc: LenientDoc, Identifiable, Hashable {
    let id: String
    let kind: String
    let amountCents: Int
    let currency: String
    let payerLabel: String
    let payeeLabel: String
    let agentLabel: String?
    let why: String
    let ruleSource: String
    let ruleText: String
    let state: ReceiptState
    let occurredAt: Date
    let category: String?
    let ownerId: String?
    let payeeId: String?
    let paypalIds: [String: String]

    init(_ f: DocFields) {
        id = f.id
        kind = f.str("kind") ?? "purchase"
        amountCents = f.int("amountCents") ?? 0
        currency = f.str("currency") ?? "USD"
        payerLabel = f.str("payerLabel") ?? ""
        payeeLabel = f.str("payeeLabel") ?? ""
        agentLabel = f.str("agentLabel")
        why = f.str("why") ?? ""
        let rule = f.sub("rule")
        ruleSource = rule.str("source") ?? "policy"
        ruleText = rule.str("text") ?? ""
        state = ReceiptState(f.str("state"))
        occurredAt = f.date("occurredAt") ?? f.created
        category = f.str("category")
        ownerId = f.str("ownerId")
        payeeId = f.str("payeeId")
        var ids: [String: String] = [:]
        if case .object(let o) = f["paypal"] ?? .null {
            for (k, v) in o { if case .string(let s) = v, !s.isEmpty { ids[k] = s } }
        }
        paypalIds = ids
    }

    /// Money flowing toward the ledger's owner reads as "in" (the web's `direction`).
    var isIncoming: Bool {
        (payeeId != nil && payeeId == ownerId) || kind == "refund" || kind == "invoice"
    }

    /// The web shows the why instead of "Plex (held)".
    var title: String { payeeLabel == "Plex (held)" ? why : payeeLabel }
}

// MARK: Activity and Today

enum ActivityKind: String, LenientEnum {
    case voice, task, routine, money, memory, handoff, system
    static var fallback: ActivityKind { .system }
}

struct ActivityDoc: LenientDoc, Identifiable, Hashable {
    let id: String
    let at: Date
    let kind: ActivityKind
    let title: String
    let detail: String?
    let receiptId: String?
    let runId: String?
    let routineId: String?

    init(_ f: DocFields) {
        id = f.id
        at = f.date("at") ?? f.created
        kind = ActivityKind(f.str("kind"))
        title = f.str("title") ?? ""
        detail = f.str("detail")
        receiptId = f.str("receiptId")
        runId = f.str("runId")
        routineId = f.str("routineId")
    }
}

struct UpcomingRoutine: Hashable, Identifiable {
    let id: String
    let name: String
    let icon: String
    let nextRunAt: Date?
    let summary: String
}

/// `agent:today`
struct TodayDoc: LenientDoc {
    let userName: String
    let paused: Bool
    let needsYou: [AskDoc]
    let bills: [BillDoc]
    let routines: [UpcomingRoutine]
    let recent: [ActivityDoc]
    let pots: [PotDoc]
    let spentMonthCents: Int
    let savedMonthCents: Int
    let billsDueCents: Int

    init(_ f: DocFields) {
        let user = f.sub("user")
        userName = user.str("name") ?? ""
        paused = user.bool("paused") ?? user.bool("agentsPaused") ?? false
        needsYou = f.list("needsYou").map { AskDoc(json: $0) }
        let upcoming = f.sub("upcoming")
        bills = upcoming.list("bills").map { BillDoc(json: $0) }
        routines = upcoming.list("routines").map { r in
            let r = DocFields(r)
            return UpcomingRoutine(id: r.id, name: r.str("name") ?? "Routine", icon: r.str("icon") ?? "repeat",
                                   nextRunAt: r.date("nextRunAt"), summary: r.str("summary") ?? "")
        }
        recent = f.list("recent").map { ActivityDoc(json: $0) }
        pots = f.list("pots").map { PotDoc(json: $0) }
        let totals = f.sub("totals")
        spentMonthCents = totals.int("spentMonthCents") ?? 0
        savedMonthCents = totals.int("savedMonthCents") ?? 0
        billsDueCents = totals.int("billsDueCents") ?? 0
    }

    var firstName: String { userName.split(separator: " ").first.map(String.init) ?? "" }
}

/// `users:viewer`
struct ViewerDoc: LenientDoc {
    let id: String
    let name: String
    let paused: Bool
    let email: String?

    init(_ f: DocFields) {
        id = f.id
        name = f.str("name") ?? ""
        paused = f.bool("agentsPaused") ?? false
        email = f.str("paypalEmail")
    }
}
