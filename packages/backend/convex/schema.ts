import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vRole, vWidgetSpec } from "./lib/ledgerSpec";

/**
 * Plex data model.
 *
 * Money is always stored in integer cents. Every movement of money writes a
 * `receipts` row: that is the product's core idea ("no money moves without a
 * receipt"). Surfaces (Tasks, Causes, Ledger) read the same tables.
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

export const policyRule = v.union(
  v.object({ kind: v.literal("daily_limit"), amountCents: v.number() }),
  v.object({ kind: v.literal("per_purchase_limit"), amountCents: v.number() }),
  v.object({ kind: v.literal("approval_over"), amountCents: v.number() }),
  v.object({ kind: v.literal("block_category"), category: v.string() }),
  v.object({ kind: v.literal("allow_merchants"), merchants: v.array(v.string()) }),
  v.object({
    kind: v.literal("quiet_hours"),
    startHour: v.number(), // 0-23, local time
    endHour: v.number(),
  }),
  v.object({ kind: v.literal("monthly_limit"), amountCents: v.number() }),
  // "Pay Northwave up to $100 without asking": added when the user taps Always
  v.object({ kind: v.literal("auto_approve"), merchant: v.string(), upToCents: v.number() }),
);

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
        tools: v.optional(v.array(v.union(v.literal("web_search"), v.literal("image"), v.literal("mcp")))),
        createdFor: v.optional(v.id("tasks")), // the task nobody could do, that it was made for
      }),
    ),
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
    potId: v.optional(v.id("pots")),
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

  // ── Policy engine: pots, rules, approvals ──────────────────────────────────

  pots: defineTable({
    ownerId: v.id("users"),
    name: v.string(), // Food, Shopping, Errands, Giving
    icon: v.string(), // lucide icon name
    color: v.string(), // token name: "green" | "blue" | ...
    balanceCents: v.number(),
    spentTodayCents: v.number(),
    spentMonthCents: v.number(),
    monthlyBudgetCents: v.number(),
    rulesText: v.string(), // the user's own words
    rules: v.array(policyRule), // parsed once by the model, enforced in code
  }).index("by_owner", ["ownerId"]),

  approvals: defineTable({
    ownerId: v.id("users"),
    potId: v.id("pots"),
    agentLabel: v.string(),
    description: v.string(),
    merchant: v.optional(v.string()),
    amountCents: v.number(),
    ruleText: v.string(), // the rule that asked for approval
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")),
    receiptId: v.optional(v.id("receipts")),
    decidedAt: v.optional(v.number()), // when the person approved or declined
  }).index("by_owner_status", ["ownerId", "status"]),

  // ── Receipts: the record attached to every payment ─────────────────────────

  receipts: defineTable({
    kind: v.union(
      v.literal("task_funding"),
      v.literal("payout"),
      v.literal("refund"),
      v.literal("donation"),
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
        v.literal("donor"),
        v.literal("proof"),
        v.literal("system"),
      ),
      text: v.string(), // "Errands pot: up to $50 per task"
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
    potId: v.optional(v.id("pots")),
    taskId: v.optional(v.id("tasks")),
    causeId: v.optional(v.id("causes")),
    campaignId: v.optional(v.id("campaigns")),
    category: v.optional(v.string()), // "Food", "Shopping", "Errands", "Giving"
    // A merchant's order or booking number the payment settles ("CC-4821"): goes on the PayPal
    // payout note, and lets the merchant's page see that Plex paid it (merchants.paymentFor).
    reference: v.optional(v.string()),
    // Added by the split: who got what when a task's payment was released (lib/split.ts).
    // amountCents stays the whole capture; the lines add up to it.
    split: v.optional(v.array(splitLine)),
  })
    .index("by_owner_time", ["ownerId", "occurredAt"])
    .index("by_task", ["taskId"])
    .index("by_cause", ["causeId"])
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
      via: v.optional(v.union(v.literal("checkout"), v.literal("autopay"))), // autopay: a saved wallet, no popup
    }),
    assigneeId: v.optional(v.id("users")),
    causeId: v.optional(v.id("causes")),
    campaignId: v.optional(v.id("campaigns")),
    spots: v.optional(v.number()), // impact tasks: "4 people x 3 hours"
    tags: v.array(v.string()),
    // Added by Tasks: funding bookkeeping and the agents that wrote it
    potId: v.optional(v.id("pots")), // the poster's pot that funds it (Errands)
    fundingReceiptId: v.optional(v.id("receipts")),
    payoutReceiptId: v.optional(v.id("receipts")),
    policyNote: v.optional(v.string()), // what the policy engine said at funding
    writerModel: v.optional(v.string()), // "gemini-2.5-flash" | "heuristic"
    // Added by Hire: who may take it, and who the poster invited
    workerType: v.optional(v.union(v.literal("human"), v.literal("agent"), v.literal("either"))),
    invitedId: v.optional(v.id("users")),
    criteria: v.optional(v.array(acceptanceCriterion)), // checked by code on digital work
    autoHire: v.optional(v.boolean()), // hands-free: hire the best bid, pay when every check passes
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
  })
    .index("by_status", ["status"])
    .index("by_poster", ["posterId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_cause", ["causeId"])
    .index("by_orderId", ["funding.orderId"]),

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

  // ── Plex Causes ────────────────────────────────────────────────────────────

  causes: defineTable({
    orgId: v.id("users"),
    slug: v.string(),
    name: v.string(),
    tagline: v.string(),
    story: v.string(), // markdown, factual and specific
    location,
    coverHue: v.number(), // 0-360, for the generated cover gradient
    goalCents: v.number(),
    raisedCents: v.number(),
    donorsCount: v.number(),
    workersPaidCount: v.number(),
    tags: v.array(v.string()),
    status: v.union(v.literal("draft"), v.literal("live"), v.literal("closed")),
    // "$45 pays one person for a 3-hour shift": the cause's unit of work
    unitCents: v.optional(v.number()),
    unitLabel: v.optional(v.string()), // "pays one person for a 3-hour shift"
    sourceText: v.optional(v.string()), // what the NGO pasted into the page builder
    draftedBy: v.optional(v.string()), // "gemini-2.5-flash" or "template"
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  donations: defineTable({
    causeId: v.id("causes"),
    donorId: v.optional(v.id("users")),
    donorLabel: v.string(),
    amountCents: v.number(),
    taskId: v.optional(v.id("tasks")), // "fund a specific task"
    recurring: v.boolean(),
    source: v.union(v.literal("direct"), v.literal("saved_for_good"), v.literal("campaign")),
    paypalOrderId: v.optional(v.string()),
    receiptId: v.optional(v.id("receipts")),
    paypalCaptureId: v.optional(v.string()),
    checkoutId: v.optional(v.id("donationCheckouts")),
    message: v.optional(v.string()), // the donor's own words, if any
    reelCaption: v.optional(v.string()), // Proof Reel caption (AI or template)
    reelCaptionBy: v.optional(v.string()),
  })
    .index("by_cause", ["causeId"])
    .index("by_task", ["taskId"])
    .index("by_donor", ["donorId"])
    .index("by_checkout", ["checkoutId"]),

  /** One PayPal order, possibly split across several causes. */
  donationCheckouts: defineTable({
    donorId: v.optional(v.id("users")),
    donorLabel: v.string(), // shown on the donor wall
    message: v.optional(v.string()),
    returnSlug: v.string(), // the cause page the donor started from
    allocations: v.array(
      v.object({
        causeId: v.id("causes"),
        taskId: v.optional(v.id("tasks")),
        amountCents: v.number(),
      }),
    ),
    totalCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("created"),
      v.literal("approving"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    paypalOrderId: v.optional(v.string()),
    paypalCaptureId: v.optional(v.string()),
    payerName: v.optional(v.string()), // from PayPal, after capture
    error: v.optional(v.string()),
  }).index("by_order", ["paypalOrderId"]),

  // ── Campaigns (pay per result) ─────────────────────────────────────────────

  campaigns: defineTable({
    brandId: v.id("users"),
    name: v.string(),
    brief: v.string(),
    rule: payoutRule, // per_result
    causeId: v.optional(v.id("causes")),
    budgetCents: v.number(),
    spentCents: v.number(),
    status: v.union(v.literal("live"), v.literal("ended")),
  }),

  campaignEntries: defineTable({
    campaignId: v.id("campaigns"),
    creatorId: v.id("users"),
    postUrl: v.string(),
    platform: v.string(),
    views: v.number(),
    earnedCents: v.number(),
    paidCents: v.number(),
  }).index("by_campaign", ["campaignId"]),

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
