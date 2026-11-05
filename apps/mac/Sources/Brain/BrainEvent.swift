import Foundation

/// A JSON frame from the brain (apps/agent/plex_brain/routes.py). Audio arrives as binary frames instead.
/// The protocol is docs/plex-mac.md section 4.
struct BrainEvent: Decodable, Sendable {
    enum Kind: String, Decodable, Sendable {
        case ready, transcript, activity, interrupted, error, task, receipt
        case toolCall = "tool_call"
        case turnComplete = "turn_complete"
        case operatorStatus = "operator"
        case asksChanged = "asks_changed"
        case unknown

        init(from decoder: Decoder) throws {
            self = Kind(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
        }
    }

    let type: Kind
    // transcript
    let role: String?
    let text: String?
    let partial: Bool?
    // tool_call
    let id: String?
    let name: String?
    let args: JSONValue?
    // activity
    let kind: String?
    let label: String?
    let detail: String?
    // activity, operator: the task it belongs to
    let taskId: String?
    // operator
    let active: Bool?
    // task
    let task: TaskItem?
    // receipt: money moved
    let receipt: ReceiptItem?
    // ready, error
    let model: String?
    let message: String?

    enum CodingKeys: String, CodingKey {
        case type, role, text, partial, id, name, args, kind, label, detail, active, task, receipt, model, message
        case taskId = "task_id"
    }
}

/// Money that moved: the notch shows it as a receipt card for a few seconds. Mirrors the web's
/// ReceiptCard (amount, payee, why in the user's own words, the rule that let it through, state).
struct ReceiptItem: Decodable, Sendable, Equatable, Identifiable {
    let id: String
    let amountCents: Int
    let payee: String
    /// The user's own words.
    let why: String?
    let ruleText: String?
    /// "captured", "authorized", "sent", "refunded", … (the web's receipt states).
    let state: String?
    /// "bill", "send", "purchase", "request", "cancel", …
    let kind: String?

    init(id: String, amountCents: Int, payee: String, why: String?, ruleText: String?, state: String?, kind: String?) {
        self.id = id
        self.amountCents = amountCents
        self.payee = payee
        self.why = why
        self.ruleText = ruleText
        self.state = state
        self.kind = kind
    }

    enum CodingKeys: String, CodingKey { case id, amountCents, payee, why, ruleText, state, kind }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        amountCents = Self.cents(c, .amountCents)
        payee = (try? c.decode(String.self, forKey: .payee)) ?? "Payment"
        why = try? c.decodeIfPresent(String.self, forKey: .why)
        ruleText = try? c.decodeIfPresent(String.self, forKey: .ruleText)
        state = try? c.decodeIfPresent(String.self, forKey: .state)
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
    }

    /// Cents arrive as JSON numbers (possibly 8420.0 from Python).
    static func cents<K: CodingKey>(_ c: KeyedDecodingContainer<K>, _ key: K) -> Int {
        if let i = try? c.decode(Int.self, forKey: key) { return i }
        if let d = try? c.decode(Double.self, forKey: key) { return Int(d.rounded()) }
        return 0
    }

    /// Money coming back to the user rather than going out.
    var isRefund: Bool { state == "refunded" || kind == "refund" }
}

/// A background task, as the brain reports it (plex_brain/tasks.py `Task.snapshot`).
struct TaskItem: Decodable, Sendable, Identifiable, Equatable {
    struct Confirm: Decodable, Sendable, Equatable {
        let title: String
        let detail: String?
    }

    /// "Plex needs you": something only the user can do (sign in, pass a check), then "I've done it".
    struct Takeover: Decodable, Sendable, Equatable {
        let title: String
        let detail: String?
        /// "takeover" or "login".
        let kind: String?
        let url: String?
    }

    /// A money approval: the policy engine asked before this payment.
    struct Approval: Decodable, Sendable, Equatable {
        let amountCents: Int
        let payee: String
        let ruleText: String?
        let potName: String?
        let askId: String?

        enum CodingKeys: String, CodingKey { case amountCents, payee, ruleText, potName, askId }

        init(amountCents: Int, payee: String, ruleText: String?, potName: String?, askId: String?) {
            self.amountCents = amountCents
            self.payee = payee
            self.ruleText = ruleText
            self.potName = potName
            self.askId = askId
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            amountCents = ReceiptItem.cents(c, .amountCents)
            payee = (try? c.decode(String.self, forKey: .payee)) ?? "Payment"
            ruleText = try? c.decodeIfPresent(String.self, forKey: .ruleText)
            potName = try? c.decodeIfPresent(String.self, forKey: .potName)
            askId = try? c.decodeIfPresent(String.self, forKey: .askId)
        }
    }

    /// The routine a quiet run belongs to.
    struct Routine: Decodable, Sendable, Equatable {
        let id: String
        let name: String
    }

    struct Card: Decodable, Sendable, Equatable, Identifiable {
        let title: String
        let subtitle: String?
        let image: String?
        let url: String?
        let reason: String?
        /// A one-word label over the picture.
        let tag: String?
        var id: String { title + (subtitle ?? "") }

        init(title: String, subtitle: String?, image: String?, url: String?, reason: String?, tag: String? = nil) {
            self.title = title
            self.subtitle = subtitle
            self.image = image
            self.url = url
            self.reason = reason
            self.tag = tag
        }
    }

    let id: String
    let title: String
    let status: String
    let steps: [String]
    let question: String?
    /// A question's choices, when it has them.
    var options: [String] = []
    let confirm: Confirm?
    let say: String?
    let cards: [Card]
    /// Rich cards (a note, a day, a file), newest last.
    var views: [TaskView] = []
    let error: String?
    var takeover: Takeover?
    var approval: Approval?
    var receipt: ReceiptItem?
    var routine: Routine?

    enum CodingKeys: String, CodingKey {
        case id, title, status, steps, question, options, confirm, say, cards, views, error, takeover, approval, receipt, routine
    }

    init(id: String, title: String, status: String, steps: [String], question: String? = nil, options: [String] = [],
         confirm: Confirm? = nil, say: String? = nil, cards: [Card] = [], views: [TaskView] = [], error: String? = nil,
         takeover: Takeover? = nil, approval: Approval? = nil, receipt: ReceiptItem? = nil, routine: Routine? = nil) {
        self.id = id
        self.title = title
        self.status = status
        self.steps = steps
        self.question = question
        self.options = options
        self.confirm = confirm
        self.say = say
        self.cards = cards
        self.views = views
        self.error = error
        self.takeover = takeover
        self.approval = approval
        self.receipt = receipt
        self.routine = routine
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        status = try c.decode(String.self, forKey: .status)
        steps = (try? c.decodeIfPresent([String].self, forKey: .steps)) ?? []
        question = try? c.decodeIfPresent(String.self, forKey: .question)
        options = (try? c.decodeIfPresent([String].self, forKey: .options)) ?? []
        confirm = try? c.decodeIfPresent(Confirm.self, forKey: .confirm)
        say = try? c.decodeIfPresent(String.self, forKey: .say)
        cards = (try? c.decodeIfPresent([Card].self, forKey: .cards)) ?? []
        // One view the app can't read shouldn't lose the task.
        views = (try? c.decodeIfPresent([Lossy<TaskView>].self, forKey: .views))?.compactMap(\.value) ?? []
        error = try? c.decodeIfPresent(String.self, forKey: .error)
        takeover = try? c.decodeIfPresent(Takeover.self, forKey: .takeover)
        approval = try? c.decodeIfPresent(Approval.self, forKey: .approval)
        receipt = try? c.decodeIfPresent(ReceiptItem.self, forKey: .receipt)
        routine = try? c.decodeIfPresent(Routine.self, forKey: .routine)
    }

    var isRunning: Bool { status == "running" }
    var needsYou: Bool { status == "needs_input" || status == "needs_confirmation" || status == "needs_takeover" }
    var isOver: Bool { status == "done" || status == "failed" || status == "cancelled" }
    /// A routine's run: it stays out of the way (a pill when it ends) unless it needs the user.
    var isQuiet: Bool { routine != nil && !needsYou }
}

/// Decodes to nil instead of failing the whole list.
struct Lossy<T: Decodable & Sendable>: Decodable, Sendable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

/// A rich card inside a task (the brain's `show_view`): which fields are set depends on `type`.
struct TaskView: Decodable, Sendable, Equatable, Identifiable {
    struct Stop: Decodable, Sendable, Equatable, Identifiable {
        let time: String?
        let title: String
        let kind: String?
        let note: String?
        let address: String?
        let walkMin: Int?
        let lat: Double?
        let lon: Double?
        let image: String?
        let with: String?
        var id: String { (time ?? "") + title }

        enum CodingKeys: String, CodingKey {
            case time, title, kind, note, address, lat, lon, image, with
            case walkMin = "walk_min"
        }
    }

    struct Spot: Decodable, Sendable, Equatable, Identifiable {
        let name: String
        let lat: Double
        let lon: Double
        let weight: Double?
        var id: String { name }
    }

    struct Point: Decodable, Sendable, Equatable {
        let lat: Double
        let lon: Double
    }

    let type: String
    let key: String?
    let title: String?
    // person
    let name: String?
    let age: Int?
    let relation: String?
    let home: String?
    let needs: String?
    let stepFree: Bool?
    let birthday: String?
    let readsAs: [String]?
    let loves: [String]?
    // timeline
    let stops: [Stop]?
    // map
    let center: Point?
    let areas: [Spot]?
    // note, file
    let text: String?
    let detail: String?
    let path: String?
    // gifts, picks: generic cards
    let cards: [TaskItem.Card]?

    var id: String { type + (key ?? title ?? "") }

    enum CodingKeys: String, CodingKey {
        case type, key, title, name, age, relation, home, needs, birthday, loves, stops, center, areas, text, detail, path, cards
        case stepFree = "step_free"
        case readsAs = "reads_as"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        key = try? c.decodeIfPresent(String.self, forKey: .key)
        title = try? c.decodeIfPresent(String.self, forKey: .title)
        name = try? c.decodeIfPresent(String.self, forKey: .name)
        age = try? c.decodeIfPresent(Int.self, forKey: .age)
        relation = try? c.decodeIfPresent(String.self, forKey: .relation)
        home = try? c.decodeIfPresent(String.self, forKey: .home)
        needs = try? c.decodeIfPresent(String.self, forKey: .needs)
        stepFree = try? c.decodeIfPresent(Bool.self, forKey: .stepFree)
        birthday = try? c.decodeIfPresent(String.self, forKey: .birthday)
        readsAs = try? c.decodeIfPresent([String].self, forKey: .readsAs)
        loves = try? c.decodeIfPresent([String].self, forKey: .loves)
        stops = try? c.decodeIfPresent([Stop].self, forKey: .stops)
        center = try? c.decodeIfPresent(Point.self, forKey: .center)
        areas = try? c.decodeIfPresent([Spot].self, forKey: .areas)
        text = try? c.decodeIfPresent(String.self, forKey: .text)
        detail = try? c.decodeIfPresent(String.self, forKey: .detail)
        path = try? c.decodeIfPresent(String.self, forKey: .path)
        cards = try? c.decodeIfPresent([TaskItem.Card].self, forKey: .cards)
    }
}

