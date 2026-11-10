import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vRole, vWidgetSpec } from "./lib/ledgerSpec";

/**
 * Plex data model.
 *
 * Money is always stored in integer cents. Every movement of money writes a
 * `receipts` row: that is the product's core idea ("no money moves without a
 * receipt"). Surfaces (Tasks, Hire, Ledger) read the same tables.
 *
 * Sections are grouped by surface so parallel work rarely touches the same
 * lines. Add new tables at the end of your surface's section.
 */

// ── Shared value shapes ──────────────────────────────────────────────────────

export const location = v.object({
  label: v.string(),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  radiusM: v.optional(v.number()),
});

export const proofSpecItem = v.object({
  label: v.string(),
  description: v.string(),
  type: v.union(
    v.literal("photo"),
    v.literal("video"),
    v.literal("file"),
    v.literal("text"),
    v.literal("link"),
  ),
});

/** One share of a released task payment (lib/split.ts). */
export const splitLine = v.object({
  role: v.union(v.literal("earner"), v.literal("creator"), v.literal("plex")),
  label: v.string(),
  note: v.optional(v.string()),
  cents: v.number(),
  via: v.union(v.literal("payout"), v.literal("kept")),
  payeeId: v.optional(v.id("users")),
  payoutItemId: v.optional(v.string()),
});

export const receiptState = v.union(
  v.literal("pending"),
  v.literal("funded"),
  v.literal("held"),
  v.literal("released"),
  v.literal("paid"),
  v.literal("refunded"),
  v.literal("disputed"),
  v.literal("declined"),
);

export const taskStatus = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("assigned"),
  v.literal("submitted"),
  v.literal("verifying"),
  v.literal("approved"),
  v.literal("paid"),
  v.literal("rejected"),
  v.literal("disputed"),
  v.literal("cancelled"),
  v.literal("refunded"),
);

export const verificationMode = v.union(
  v.literal("auto"),
  v.literal("one_tap"),
  v.literal("manual"),
);

export const payoutRule = v.union(
  v.object({ kind: v.literal("fixed"), amountCents: v.number() }),
  v.object({
    kind: v.literal("per_unit"),
    amountCents: v.number(),
    unitLabel: v.string(),
    maxUnits: v.number(),
  }),
  v.object({
    kind: v.literal("per_result"),
    perThousandViewsCents: v.number(),
    bonusAtViews: v.optional(v.number()),
    bonusCents: v.optional(v.number()),
    capCents: v.number(),
  }),
);

export const verdictCheck = v.object({
  check: v.string(), // e.g. "Storefront photo", "Challenge code", "Taken in window"
  passed: v.boolean(),
  detail: v.string(),
});

/** Objective acceptance criteria for digital work, checked by code before anyone is paid. */
export const acceptanceCriterion = v.union(
  v.object({ kind: v.literal("min_words"), specIndex: v.number(), words: v.number(), max: v.optional(v.number()) }),
  v.object({ kind: v.literal("min_sources"), count: v.number() }),
  v.object({ kind: v.literal("links_resolve") }),
  v.object({ kind: v.literal("must_mention"), terms: v.array(v.string()) }),
  v.object({ kind: v.literal("image"), specIndex: v.number(), minPx: v.number() }),
  v.object({ kind: v.literal("video"), specIndex: v.number(), minSeconds: v.number(), vertical: v.optional(v.boolean()) }),
);

export default defineSchema({
  // ── People, orgs and agents ────────────────────────────────────────────────

  users: defineTable({
    clerkId: v.optional(v.string()),
    handle: v.string(), // stable slug, e.g. "adi"
    name: v.string(),
    kind: v.union(v.literal("person"), v.literal("org"), v.literal("brand"), v.literal("agent")),
    avatarColor: v.optional(v.string()), // hex used for the initials avatar
    avatarUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    area: v.optional(v.string()), // "Mission, SF"
    skills: v.optional(v.array(v.string())),
    rating: v.optional(v.number()), // 0-5
    proofPassRate: v.optional(v.number()), // 0-1
    tasksCompleted: v.optional(v.number()),
    paypalEmail: v.optional(v.string()), // sandbox personal account for payouts
    agentsPaused: v.optional(v.boolean()), // the global Pause switch
    isDemo: v.optional(v.boolean()),
    // Added by Hire: AI agents that take work (kind "agent")
    agentProfile: v.optional(
      v.object({
        house: v.boolean(), // run by Plex (Scout, Quill, Tally) or by an outside developer
        ownerId: v.optional(v.id("users")), // who is paid for its work
        model: v.string(), // "gemini-2.5-flash"
        tagline: v.string(),
        specialties: v.array(v.string()), // keywords it bids on
        floorCents: v.number(), // private: the least it will take, enforced in code
        turnaround: v.string(), // "about 2 minutes"
        // Added by the agent builder: agents people create with Plex's builder agent
        custom: v.optional(v.boolean()),
        instructions: v.optional(v.string()), // the creator's method and style; below Plex's rules, never shown publicly
        tools: v.optional(v.array(v.union(v.literal("web_search"), v.literal("image"), v.literal("video"), v.literal("mcp")))),
        createdFor: v.optional(v.id("tasks")), // the task nobody could do, that it was made for
        // Added by "Bring your agent": an agent that runs on its developer's own server.
        // Plex bids for it inside its floor, POSTs it the task when hired (signed), and
        // checks its work like any other. The URL and secret are AES-GCM sealed.
        endpoint: v.optional(
          v.object({
            host: v.string(), // shown publicly, e.g. "agents.acme.dev"
            urlEnc: v.string(),
            secretEnc: v.string(), // HMAC key for X-Plex-Signature
            verifiedAt: v.number(),
            latencyMs: v.optional(v.number()),
            failures: v.optional(v.number()),
          }),
        ),
      }),
    ),
    // Added by onboarding: what the person came to do, and what each side needs.
    // A role counts once its onboarding finished (convex/onboarding.ts).
    onboarding: v.optional(
      v.object({
        intent: v.optional(v.union(v.literal("post"), v.literal("earn"), v.literal("both"))),
        poster: v.optional(v.number()), // finished posting setup at
        doer: v.optional(v.number()), // finished earning setup at
        step: v.optional(v.string()), // where to resume, e.g. "d_where"
      }),
    ),
    homeMode: v.optional(v.union(v.literal("post"), v.literal("earn"))), // the Home switch, for people with both roles
    interests: v.optional(v.object({ post: v.optional(v.array(v.string())), work: v.optional(v.array(v.string())) })),
    workMode: v.optional(v.union(v.literal("in_person"), v.literal("online"), v.literal("both"))),
    place: v.optional(
      v.object({ label: v.string(), lat: v.optional(v.number()), lng: v.optional(v.number()), radiusKm: v.number(), unit: v.union(v.literal("mi"), v.literal("km")) }),
    ),
    languages: v.optional(v.array(v.string())),
    experience: v.optional(v.array(v.object({ title: v.string(), company: v.string(), years: v.optional(v.string()) }))),
    availability: v.optional(v.array(v.union(v.literal("weekdays"), v.literal("evenings"), v.literal("weekends")))),
    minRateCents: v.optional(v.number()), // the least a person will take for a task; private
    postDefaults: v.optional(
      v.object({
        workerType: v.union(v.literal("human"), v.literal("agent"), v.literal("either")),
        approval: v.union(v.literal("one_tap"), v.literal("auto")), // approve each payment, or pay when every check passes
      }),
    ),
    resumeFileId: v.optional(v.id("_storage")),
  })
    .index("by_handle", ["handle"])
    .index("by_clerkId", ["clerkId"])
    .index("by_kind", ["kind"]),

  agents: defineTable({
    ownerId: v.id("users"),
    name: v.string(), // "Claude (MCP)"
    kind: v.union(
      v.literal("mcp"),
      v.literal("ledger"),
      v.literal("system"),
    ),
    keyPrefix: v.optional(v.string()), // first chars of a scoped API key
    keyHash: v.optional(v.string()),
    revoked: v.optional(v.boolean()),
    // Added by Hire: a key can also act as an agent worker that applies and delivers
    workerId: v.optional(v.id("users")),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_keyHash", ["keyHash"]),

  // Auto-pay: a PayPal wallet saved once with PayPal Vault, so tasks (and the
  // agents posting them) can hold funds without a checkout popup. Its own table
  // so the payment token never rides along with a user doc to a browser.
  autopay: defineTable({
    userId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("off")),
    setupTokenId: v.optional(v.string()),
    vaultId: v.optional(v.string()), // PayPal payment token
    customerId: v.optional(v.string()),
    payerEmail: v.optional(v.string()),
    limitCents: v.number(), // the most one task may hold without asking
    dailyLimitCents: v.number(),
    usedDay: v.string(), // "2026-11-07" (UTC), resets usedCents
    usedCents: v.number(),
    lastUsedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // A poster's account access for one task (a GitHub token, an MCP server). The
  // token is AES-GCM encrypted with CONNECTIONS_KEY, only the hired agent's tool
  // calls and the proof check use it, it never reaches a browser, and it is
  // wiped when the task is paid or refunded.
  taskConnections: defineTable({
    taskId: v.id("tasks"),
    kind: v.union(v.literal("github"), v.literal("mcp")),
    label: v.string(), // "GitHub" or the server's host
    url: v.string(), // the MCP endpoint (for a custom server, only its origin: the full URL is sealed)
    urlEnc: v.optional(v.string()), // custom servers' full URL, encrypted: hosted MCP URLs often carry a key in the path
    tokenEnc: v.optional(v.string()),
    allow: v.optional(v.array(v.string())), // tool names the agent may call; empty = all but the blocked ones
    addedBy: v.id("users"),
    wipedAt: v.optional(v.number()),
  }).index("by_task", ["taskId"]),

  // "Connect GitHub" / "Connect Google": one row per OAuth round trip, used once, so a callback can't be forged or replayed.
  oauthStates: defineTable({
    state: v.string(), // random, sent to the provider and checked on the way back
    taskId: v.optional(v.id("tasks")), // GitHub: the task the token is lent to
    crewId: v.optional(v.id("crews")), // GitHub: or the crew it's lent to
    purpose: v.optional(v.literal("google")), // Google: the person's Everyday account
    userId: v.id("users"),
    origin: v.string(), // where to send the person back
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  // ── Everyday: Gmail bills and Google Calendar ──────────────────────────────

  // A person's Google account for Everyday. The refresh token is AES-GCM sealed
  // (CONNECTIONS_KEY), used only server-side, and revoked on disconnect.
  googleAccounts: defineTable({
    userId: v.id("users"),
    email: v.string(),
    refreshEnc: v.string(),
    scopes: v.string(),
    watching: v.boolean(), // Plex checks Gmail for bills every few minutes
    autoPayUnderCents: v.number(), // bills at or under this pay themselves, if every other check passes
    connectedAt: v.number(),
    lastScanAt: v.optional(v.number()),
    lastScanNote: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // Invoices a person sends from Everyday: real PayPal invoices (Invoicing v2)
  // that Plex collects and pays out to them through PayPal Payouts when paid.
  sentInvoices: defineTable({
    userId: v.id("users"),
    invoiceId: v.string(), // PayPal's INV2-…
    number: v.optional(v.string()),
    to: v.string(),
    toName: v.optional(v.string()),
    items: v.array(v.object({ name: v.string(), cents: v.number(), quantity: v.number() })),
    totalCents: v.number(),
    dueDate: v.optional(v.string()),
    note: v.optional(v.string()),
    status: v.union(v.literal("sent"), v.literal("paid"), v.literal("paid_out"), v.literal("cancelled")),
    payUrl: v.optional(v.string()),
    reminders: v.number(),
    lastRemindedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    receiptId: v.optional(v.id("receipts")),
    lastCheckedAt: v.optional(v.number()),
    problem: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // Every Gmail message Plex looked at for a bill. Non-bills are kept (status
  // "not_a_bill") only so they aren't read twice.
  gmailBills: defineTable({
    userId: v.id("users"),
    gmailId: v.string(),
    from: v.string(), // "Sunny Window Co <billing@sunny.example>"
    fromEmail: v.string(),
    subject: v.string(),
    receivedAt: v.number(),
    vendor: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    dueDate: v.optional(v.string()), // "2026-11-20"
    invoiceNumber: v.optional(v.string()),
    payTo: v.optional(v.string()), // the PayPal email the bill says to pay
    summary: v.optional(v.string()),
    model: v.optional(v.string()),
    status: v.union(
      v.literal("not_a_bill"),
      v.literal("needs_approval"),
      v.literal("paying"),
      v.literal("paid"),
      v.literal("declined"),
    ),
    // Plex's rules, checked by code: why it paid by itself, or why it asked.
    checks: v.array(verdictCheck),
    autoPay: v.optional(v.boolean()), // every check passed, so it paid without asking
    note: v.optional(v.string()), // the last problem, in words
    orderId: v.optional(v.string()), // a checkout waiting at PayPal
    receiptId: v.optional(v.id("receipts")),
    reminderLink: v.optional(v.string()), // the Calendar reminder for its due date
    decidedAt: v.optional(v.number()),
  })
    .index("by_user_time", ["userId", "receivedAt"])
    .index("by_user_gmail", ["userId", "gmailId"]),

  // ── Receipts: the record attached to every payment ─────────────────────────

  receipts: defineTable({
    kind: v.union(
      v.literal("task_funding"),
      v.literal("payout"),
      v.literal("refund"),
      v.literal("purchase"),
      v.literal("invoice"),
      v.literal("subscription"),
    ),
    amountCents: v.number(),
    currency: v.string(), // "USD"
    payerId: v.optional(v.id("users")),
    payeeId: v.optional(v.id("users")),
    payerLabel: v.string(),
    payeeLabel: v.string(),
    agentLabel: v.optional(v.string()), // which agent acted, if any
    why: v.string(), // the original instruction, in the user's words
    rule: v.object({
      source: v.union(
        v.literal("policy"),
        v.literal("approval"),
        v.literal("poster"),
        v.literal("proof"),
        v.literal("system"),
      ),
      text: v.string(), // "Funded by the poster, paid only when proof passes"
    }),
    evidence: v.optional(
      v.object({
        proofId: v.optional(v.id("proofs")),
        verdict: v.optional(v.string()), // "Pass · 96% · 4 of 4 checks"
        checks: v.optional(v.array(verdictCheck)),
        transcript: v.optional(v.array(v.object({ from: v.string(), text: v.string() }))),
        savedCents: v.optional(v.number()),
      }),
    ),
    state: receiptState,
    paypal: v.optional(
      v.object({
        orderId: v.optional(v.string()),
        authorizationId: v.optional(v.string()),
        captureId: v.optional(v.string()),
        payoutBatchId: v.optional(v.string()),
        payoutItemId: v.optional(v.string()),
        invoiceId: v.optional(v.string()),
        refundId: v.optional(v.string()),
        subscriptionId: v.optional(v.string()),
      }),
    ),
    timeline: v.array(v.object({ at: v.number(), label: v.string(), state: receiptState })),
    occurredAt: v.number(), // ms; explicit so seeded history can be backdated
    ownerId: v.id("users"), // whose ledger this belongs to
    taskId: v.optional(v.id("tasks")),
    category: v.optional(v.string()), // "Food", "Shopping", "Errands"
    // A merchant's order or booking number the payment settles ("CC-4821"): goes on the PayPal
    // payout note, and lets the merchant's page see that Plex paid it (merchants.paymentFor).
    reference: v.optional(v.string()),
    // Added by the split: who got what when a task's payment was released (lib/split.ts).
    // amountCents stays the whole capture; the lines add up to it.
    split: v.optional(v.array(splitLine)),
  })
    .index("by_owner_time", ["ownerId", "occurredAt"])
    .index("by_task", ["taskId"])
    .index("by_state", ["state"])
    .index("by_reference", ["reference"]),

  // ── Plex Tasks ─────────────────────────────────────────────────────────────

  tasks: defineTable({
    posterId: v.id("users"),
    postedVia: v.union(v.literal("web"), v.literal("mcp")),
    agentLabel: v.optional(v.string()),
    title: v.string(),
    brief: v.string(), // the loose request, in the poster's words
    description: v.string(), // written by the Task Writer agent
    category: v.union(
      v.literal("local"),
      v.literal("remote"),
      v.literal("data"),
      v.literal("creator"),
      v.literal("agent"),
      v.literal("impact"),
    ),
    location: v.optional(location),
    windowStart: v.number(),
    windowEnd: v.number(),
    payout: payoutRule,
    currency: v.string(),
    proofSpec: v.array(proofSpecItem),
    verificationMode,
    challengeCode: v.string(), // shown to the worker, must appear in one photo
    status: taskStatus,
    funding: v.object({
      state: v.union(
        v.literal("unfunded"),
        v.literal("authorized"),
        v.literal("captured"),
        v.literal("released"),
        v.literal("refunded"),
      ),
      orderId: v.optional(v.string()),
      authorizationId: v.optional(v.string()),
      captureId: v.optional(v.string()),
      via: v.optional(v.union(v.literal("checkout"), v.literal("autopay"), v.literal("backers"))), // autopay: a saved wallet, no popup; backers: many donors' holds
    }),
    assigneeId: v.optional(v.id("users")),
    spots: v.optional(v.number()), // impact tasks: "4 people x 3 hours"
    tags: v.array(v.string()),
    // Added by Tasks: funding bookkeeping and the agents that wrote it
    fundingReceiptId: v.optional(v.id("receipts")),
    payoutReceiptId: v.optional(v.id("receipts")),
    writerModel: v.optional(v.string()), // "gemini-2.5-flash" | "heuristic"
    // Added by Hire: who may take it, and who the poster invited
    workerType: v.optional(v.union(v.literal("human"), v.literal("agent"), v.literal("either"))),
    invitedId: v.optional(v.id("users")),
    criteria: v.optional(v.array(acceptanceCriterion)), // checked by code on digital work
    autoHire: v.optional(v.boolean()), // hands-free: hire the best bid, pay when every check passes
    // Back a task: an organization opened it to donors, who fund it together (see `backings`).
    backing: v.optional(v.object({ goalCents: v.number(), story: v.optional(v.string()), openedAt: v.number() })),
    // Accounts the poster connected for the hired agent (GitHub, MCP servers). No secrets here: see taskConnections.
    connections: v.optional(v.array(v.object({ kind: v.union(v.literal("github"), v.literal("mcp")), label: v.string() }))),
    // The PayPal desk agent (PayPal Agent Toolkit) read PayPal's own records for this task
    paypalCheck: v.optional(
      v.object({
        at: v.number(),
        model: v.string(),
        match: v.boolean(), // code compared PayPal's numbers with the receipts
        summary: v.string(), // the agent's words
        facts: v.array(v.object({ label: v.string(), value: v.string(), ok: v.optional(v.boolean()) })),
        tools: v.array(v.string()), // toolkit calls the agent made, in order
        dispute: v.optional(
          v.object({
            id: v.string(),
            status: v.string(),
            reason: v.string(),
            amount: v.string(),
            action: v.union(v.literal("contest"), v.literal("accept")), // decided by code from the proof
            why: v.string(),
          }),
        ),
      }),
    ),
    // Added by the split: the fee terms, locked when the poster accepts someone (lib/split.ts)
    split: v.optional(
      v.object({
        kind: v.union(v.literal("human"), v.literal("custom"), v.literal("house")),
        plexBps: v.number(),
        lockedAt: v.number(),
      }),
    ),
    // Added by Crews: this task is one step of a crew
    crew: v.optional(v.object({ crewId: v.id("crews"), stepKey: v.string() })),
  })
    .index("by_status", ["status"])
    .index("by_poster", ["posterId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_orderId", ["funding.orderId"]),

  // ── Back a task: people give toward proven work ────────────────────────────
  // One row per donor's PayPal hold on a backed task. Held, not charged; every
  // hold is captured together when the task's photo proof passes, or voided
  // together if it doesn't. The donor then sees the proof photos.
  backings: defineTable({
    taskId: v.id("tasks"),
    donorId: v.id("users"),
    donorName: v.string(),
    amountCents: v.number(),
    message: v.optional(v.string()),
    state: v.union(v.literal("pending"), v.literal("held"), v.literal("captured"), v.literal("voided"), v.literal("declined")),
    via: v.optional(v.union(v.literal("checkout"), v.literal("autopay"))),
    orderId: v.optional(v.string()),
    authorizationId: v.optional(v.string()),
    captureId: v.optional(v.string()),
    receiptId: v.optional(v.id("receipts")),
  })
    .index("by_task", ["taskId"])
    .index("by_donor", ["donorId"]),

  // ── Crews: a team of agents on a canvas ─────────────────────────────────────
  // A goal split into steps. Each step becomes a hands-free task (its own
  // PayPal hold, bids, proof, payout); a step starts only when the steps it
  // depends on passed, and gets their work as input. Code runs the flow.
  crews: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    goal: v.string(), // the poster's words
    budgetCents: v.number(), // the ceiling for all steps together
    status: v.union(
      v.literal("draft"),
      v.literal("running"),
      v.literal("paused"), // a step failed or needs the owner
      v.literal("done"),
      v.literal("cancelled"),
    ),
    steps: v.array(
      v.object({
        key: v.string(), // "logo"
        title: v.string(),
        brief: v.string(), // what the step's agent is asked to do
        deliver: v.object({ label: v.string(), description: v.string(), type: v.union(v.literal("text"), v.literal("file"), v.literal("link")) }),
        payoutCents: v.number(),
        dependsOn: v.array(v.string()), // keys of the steps whose work it takes as input
        agentHandle: v.optional(v.string()), // invite this agent; otherwise agents bid
        building: v.optional(v.boolean()), // no agent fit, so Plex's agent builder is making one
        built: v.optional(v.boolean()), // its agent was made for this crew
        x: v.number(),
        y: v.number(),
        taskId: v.optional(v.id("tasks")),
        note: v.optional(v.string()), // why it's paused, the approval link, ...
      }),
    ),
    plannerModel: v.optional(v.string()),
    template: v.optional(v.string()),
    slug: v.optional(v.string()), // published: anyone can open it and run their own copy
    runs: v.optional(v.number()), // copies run from the published page
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"]),

  // GitHub lent to a whole crew, so its GitHub steps can act there. Sealed like a
  // task connection, copied into each GitHub step's task as it starts, and
  // deleted when the crew ends. Its own table so the token never rides along
  // with a crew doc to a browser.
  crewConnections: defineTable({
    crewId: v.id("crews"),
    kind: v.literal("github"),
    label: v.string(),
    tokenEnc: v.string(),
    addedBy: v.id("users"),
  }).index("by_crew", ["crewId"]),

  applications: defineTable({
    taskId: v.id("tasks"),
    applicantId: v.id("users"),
    viaAgent: v.boolean(),
    askCents: v.number(),
    message: v.string(),
    matchScore: v.optional(v.number()), // 0-100 from the Match agent
    matchReason: v.optional(v.string()),
    matchModel: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("withdrawn"),
    ),
    // Added by Hire: agent bidding rounds, each clamped in code to the agent's floor and the held amount
    bids: v.optional(
      v.array(
        v.object({
          round: v.number(),
          cents: v.number(),
          note: v.string(),
          model: v.string(),
          clamped: v.optional(v.boolean()), // code moved the model's number back inside the limits
          at: v.number(),
        }),
      ),
    ),
  })
    .index("by_task", ["taskId"])
    .index("by_applicant", ["applicantId"]),

  proofs: defineTable({
    taskId: v.id("tasks"),
    workerId: v.id("users"),
    items: v.array(
      v.object({
        specIndex: v.number(),
        storageId: v.optional(v.id("_storage")),
        url: v.optional(v.string()),
        text: v.optional(v.string()),
        capturedAt: v.optional(v.number()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        phash: v.optional(v.string()),
      }),
    ),
    note: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("checking"),
      v.literal("pass"),
      v.literal("fail"),
      v.literal("unsure"),
    ),
    verdict: v.optional(
      v.object({
        result: v.union(v.literal("pass"), v.literal("fail"), v.literal("unsure")),
        confidence: v.number(), // 0-1
        summary: v.string(),
        checks: v.array(verdictCheck),
        model: v.string(),
      }),
    ),
    decision: v.optional(
      v.union(v.literal("approved"), v.literal("rejected"), v.literal("contested")),
    ),
    // Added by Tasks: checks resolving live, the contest path
    progress: v.optional(
      v.array(
        v.object({
          check: v.string(),
          status: v.union(v.literal("pending"), v.literal("pass"), v.literal("fail"), v.literal("unsure")),
          detail: v.optional(v.string()),
        }),
      ),
    ),
    challengeConfirmed: v.optional(v.boolean()), // worker says the code is in a photo
    rejectReason: v.optional(v.string()),
    contestNote: v.optional(v.string()),
    mediation: v.optional(
      v.object({
        summary: v.string(),
        recommendation: v.union(v.literal("release"), v.literal("partial"), v.literal("refund")),
        model: v.string(),
      }),
    ),
    // Added by Hire: blind proofer agents scoring digital work
    scorecards: v.optional(
      v.array(
        v.object({
          proofer: v.string(), // "Proofer A · Strict"
          completeness: v.number(), // 1-5
          accuracy: v.number(),
          method: v.number(),
          quality: v.number(),
          verdict: v.union(v.literal("pass"), v.literal("fail"), v.literal("unsure")),
          note: v.string(),
          model: v.string(),
        }),
      ),
    ),
  })
    .index("by_task", ["taskId"])
    .index("by_worker", ["workerId"]),

  /** Hire: a review can only be left on a task that was paid. */
  reviews: defineTable({
    taskId: v.id("tasks"),
    authorId: v.id("users"),
    subjectId: v.id("users"),
    stars: v.number(), // 1-5
    text: v.string(),
    receiptId: v.optional(v.id("receipts")), // the payout it's tied to
  })
    .index("by_subject", ["subjectId"])
    .index("by_task", ["taskId"]),

  // ── Personal: splits ───────────────────────────────────────────────────────

  splits: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    totalCents: v.number(),
    participants: v.array(
      v.object({
        name: v.string(),
        userId: v.optional(v.id("users")),
        shareCents: v.number(),
        invoiceId: v.optional(v.string()),
        status: v.union(v.literal("sent"), v.literal("paid"), v.literal("reminded")),
      }),
    ),
    occurredAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  // ── PayPal plumbing ────────────────────────────────────────────────────────

  webhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    resourceId: v.optional(v.string()),
    payload: v.any(),
    verified: v.boolean(),
    processedAt: v.optional(v.number()),
  }).index("by_eventId", ["eventId"]),
  // ── Plex Ledger ────────────────────────────────────────────────────────────

  /** Questions asked of the Ledger (web or MCP) and the Analyst's answer. */
  ledgerAsks: defineTable({
    ownerId: v.id("users"),
    role: vRole,
    question: v.string(),
    via: v.union(v.literal("web"), v.literal("mcp")),
    status: v.union(v.literal("thinking"), v.literal("done"), v.literal("error")),
    answer: v.optional(v.string()),
    widgets: v.optional(v.array(vWidgetSpec)),
    followUps: v.optional(v.array(v.string())),
    engine: v.optional(v.union(v.literal("gemini"), v.literal("heuristic"))),
    engineNote: v.optional(v.string()), // e.g. "No Gemini key: deterministic parser"
  }).index("by_owner", ["ownerId"]),

  /** Widgets pinned to a role's dashboard, usually built by the Analyst. */
  ledgerWidgets: defineTable({
    ownerId: v.id("users"),
    role: vRole,
    spec: vWidgetSpec,
    askId: v.optional(v.id("ledgerAsks")),
    question: v.optional(v.string()),
    order: v.number(),
  }).index("by_owner_role", ["ownerId", "role"]),

  /**
   * Actions requested from the dashboard (reminders, payouts, refunds), always
   * after a confirmation. The real payout and refund flows live in Tasks; the
   * Ledger records the request and hands it over.
   */
  ledgerActions: defineTable({
    ownerId: v.id("users"),
    role: vRole,
    tool: v.union(v.literal("send_reminder"), v.literal("release_payout"), v.literal("refund")),
    targetLabel: v.string(),
    amountCents: v.optional(v.number()),
    receiptId: v.optional(v.id("receipts")),
    splitId: v.optional(v.id("splits")),
    status: v.union(v.literal("handed_off"), v.literal("done")),
    note: v.string(),
  }).index("by_owner", ["ownerId"]),
});
