import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { writeReceipt } from "./lib/receipts";
import { seedLedgerHistory } from "./lib/ledgerSeed";
import { seedHireWorld } from "./lib/hireSeed";
import schema from "./schema";

/**
 * The demo world (docs/Plex-Project-Plan.md §9). All brands, people and the
 * NGO are invented. Run with `pnpm seed`; pass `{"reset": true}` to wipe and
 * rebuild: `pnpm --filter @plex/backend exec convex run seed:run '{"reset":true}'`.
 */

const TABLES: TableNames[] = [
  "users", "agents", "receipts", "tasks", "applications",
  "proofs", "splits", "webhookEvents",
  "ledgerAsks", "ledgerWidgets", "ledgerActions",
  "reviews",
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const run = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, { reset }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", "adi"))
      .unique();
    if (existing && !reset) return "Demo world already seeded. Pass {\"reset\": true} to rebuild.";
    if (reset) {
      for (const table of TABLES) {
        for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
      }
    }

    // On the half hour, so seeded task windows read "2–6pm", not "2:39–6:39pm".
    const now = Math.floor(Date.now() / (HOUR / 2)) * (HOUR / 2);
    const ago = (days: number, hours = 0) => now - days * DAY - hours * HOUR;

    // ── People ──────────────────────────────────────────────────────────────
    const person = (
      handle: string,
      name: string,
      avatarColor: string,
      extra: Record<string, unknown> = {},
    ) =>
      ctx.db.insert("users", {
        handle,
        name,
        kind: "person",
        avatarColor,
        isDemo: true,
        // Payouts to the demo workers land in one real sandbox personal account
        // when PAYPAL_DEMO_PAYEE_EMAIL is set; otherwise PayPal holds them as
        // unclaimed at a made-up address.
        paypalEmail:
          handle !== "adi" && process.env.PAYPAL_DEMO_PAYEE_EMAIL
            ? process.env.PAYPAL_DEMO_PAYEE_EMAIL
            : `${handle}.plex@personal.example.com`,
        ...extra,
      });

    const adi = await person("adi", "Adi Reddy", "#1F7A5A", {
      area: "Mission, San Francisco",
      bio: "Lets his agents run errands, within limits.",
      agentsPaused: false,
    });
    const maya = await person("maya", "Maya Chen", "#3B6FD8");
    const jonah = await person("jonah", "Jonah Brooks", "#C2703D");
    const priya = await person("priya", "Priya Nair", "#8A5CC7");

    const rosa = await person("rosa", "Rosa Delgado", "#D0573F", {
      area: "Mission, SF",
      bio: "Photographer. Local checks and storefront shoots, usually same day.",
      skills: ["Local checks", "Photography", "Spanish"],
      rating: 4.9,
      proofPassRate: 0.98,
      tasksCompleted: 142,
    });
    const theo = await person("theo", "Theo Park", "#2E86AB", {
      area: "Remote · Oakland",
      bio: "QA tester. Old phones, slow networks, screen readers.",
      skills: ["User testing", "Accessibility", "Android"],
      rating: 4.8,
      proofPassRate: 0.95,
      tasksCompleted: 87,
    });
    const amara = await person("amara", "Amara Okafor", "#7B61C9", {
      area: "Remote · Lagos",
      bio: "Data labeling and tone rating, English and Yoruba.",
      skills: ["Data labeling", "Rating", "Transcription"],
      rating: 4.95,
      proofPassRate: 0.99,
      tasksCompleted: 310,
    });
    const luis = await person("luis", "Luis Ortega", "#3F8F4E", {
      area: "Bernal Heights, SF",
      bio: "Errands by bike. Pickups, drop-offs, line-waiting.",
      skills: ["Errands", "Delivery", "Local checks"],
      rating: 4.7,
      proofPassRate: 0.93,
      tasksCompleted: 64,
    });
    const kenji = await person("kenji", "Kenji Watanabe", "#B8860B", {
      area: "Oakland",
      bio: "Short-form video about the East Bay outdoors.",
      skills: ["Creator", "Video", "Editing"],
      rating: 4.85,
      proofPassRate: 0.97,
      tasksCompleted: 23,
    });

    const lakeside = await ctx.db.insert("users", {
      handle: "lakeside-commons",
      name: "Lakeside Commons",
      kind: "org",
      avatarColor: "#1F6F8B",
      bio: "Volunteer-founded group caring for the Lake Merritt shoreline since 2016.",
      area: "Oakland, CA",
      isDemo: true,
    });
    const fernway = await ctx.db.insert("users", {
      handle: "fernway",
      name: "Fernway",
      kind: "brand",
      avatarColor: "#2F6B3F",
      bio: "Outdoor gear for city people.",
      isDemo: true,
    });

    // ── Agents ──────────────────────────────────────────────────────────────
    await ctx.db.insert("agents", {
      ownerId: adi,
      name: "Claude (MCP)",
      kind: "mcp",
      keyPrefix: "plx_live_7Qm",
    });

    // ── Tasks ───────────────────────────────────────────────────────────────
    const errandSpec = [
      { label: "Storefront", description: "The café's front, with its sign readable", type: "photo" as const },
      { label: "Menu", description: "The full drinks and food menu, legible", type: "photo" as const },
      { label: "Seating area", description: "The quietest corner, showing outlets if any", type: "photo" as const },
    ];
    const cafeTask = await ctx.db.insert("tasks", {
      posterId: adi,
      postedVia: "mcp",
      agentLabel: "Claude (MCP)",
      title: "Check for a quiet corner at Kettle Corner on 5th St",
      brief: "Find someone to check whether the café on 5th has a quiet corner, and photograph the menu.",
      description:
        "Visit Kettle Corner (5th St & Mission) between 2 and 6pm. Photograph the storefront, the full menu, and the quietest seating area. Note whether there are outlets and how loud it is.",
      category: "local",
      location: { label: "Kettle Corner, 5th St & Mission, SF", lat: 37.7825, lng: -122.4058, radiusM: 150 },
      windowStart: ago(0, 2),
      windowEnd: now + 4 * HOUR,
      payout: { kind: "fixed", amountCents: 1_800 },
      currency: "USD",
      proofSpec: errandSpec,
      verificationMode: "one_tap",
      challengeCode: "lantern-42",
      status: "open",
      funding: { state: "authorized", orderId: "SEED-ORDER-CAFE", authorizationId: "SEED-AUTH-CAFE" },
      tags: ["Errand", "Photos", "Same day"],
    });

    const menusTask = await ctx.db.insert("tasks", {
      posterId: adi,
      postedVia: "web",
      title: "Photograph the menus of 3 taquerias on 24th St",
      brief: "Get me current menus for the taquerias on 24th between Mission and Folsom.",
      description:
        "Photograph the full, current menu (with prices) at three taquerias on 24th St between Mission and Folsom. One photo per menu, prices legible.",
      category: "local",
      location: { label: "24th St, Mission, SF", lat: 37.7524, lng: -122.4147, radiusM: 400 },
      windowStart: ago(1, 6),
      windowEnd: ago(0, -6),
      payout: { kind: "per_unit", amountCents: 400, unitLabel: "menu", maxUnits: 3 },
      currency: "USD",
      proofSpec: [
        { label: "Menu 1", description: "Full menu with prices", type: "photo" },
        { label: "Menu 2", description: "Full menu with prices", type: "photo" },
        { label: "Menu 3", description: "Full menu with prices", type: "photo" },
      ],
      verificationMode: "one_tap",
      challengeCode: "saffron-17",
      status: "submitted",
      funding: { state: "captured", orderId: "SEED-ORDER-MENUS", captureId: "SEED-CAP-MENUS" },
      assigneeId: rosa,
      tags: ["Photos", "Per unit"],
    });

    const cleanupTask = await ctx.db.insert("tasks", {
      posterId: lakeside,
      postedVia: "web",
      title: "Saturday shoreline cleanup, east shore",
      brief: "Lake shore cleanup, Saturday: 4 people × 3 hours, $15 an hour each.",
      description:
        "Meet at the Pergola at 9am. Three hours clearing litter between the Pergola and the boathouse. Gloves, grabbers and bags provided. Take a before photo and an after photo at the marked post, with the challenge word on paper in one of them.",
      category: "impact",
      location: { label: "Lake Merritt Pergola, Oakland", lat: 37.8093, lng: -122.2498, radiusM: 300 },
      windowStart: now + 2 * DAY,
      windowEnd: now + 2 * DAY + 4 * HOUR,
      payout: { kind: "fixed", amountCents: 4_500 },
      currency: "USD",
      proofSpec: [
        { label: "Before", description: "The marked stretch before you start", type: "photo" },
        { label: "After", description: "The same spot, same angle, after the shift", type: "photo" },
        { label: "Bags", description: "The filled bags at the pickup point", type: "photo" },
      ],
      verificationMode: "auto",
      challengeCode: "willow-63",
      status: "open",
      funding: { state: "captured", orderId: "SEED-ORDER-CLEANUP", captureId: "SEED-CAP-CLEANUP" },
      spots: 4,
      tags: ["Impact", "Outdoors", "Saturday"],
    });

    await ctx.db.insert("tasks", {
      posterId: adi,
      postedVia: "mcp",
      agentLabel: "Claude (MCP)",
      title: "Rate 200 voice-assistant replies for tone",
      brief: "I need humans to rate my assistant's replies for warmth and clarity.",
      description:
        "Rate 200 short replies on two 1–5 scales (warmth, clarity) and flag anything rude. Instructions and the sheet are in the task. About 90 minutes.",
      category: "data",
      windowStart: ago(0, 5),
      windowEnd: now + 2 * DAY,
      payout: { kind: "per_unit", amountCents: 25, unitLabel: "reply", maxUnits: 200 },
      currency: "USD",
      proofSpec: [{ label: "Completed sheet", description: "Link to the filled-in ratings sheet", type: "link" }],
      verificationMode: "auto",
      challengeCode: "quartz-28",
      status: "assigned",
      funding: { state: "captured", orderId: "SEED-ORDER-RATE", captureId: "SEED-CAP-RATE" },
      assigneeId: amara,
      tags: ["Remote", "Data", "Per unit"],
    });

    const androidTask = await ctx.db.insert("tasks", {
      posterId: fernway,
      postedVia: "web",
      title: "Test our checkout on an older Android phone",
      brief: "Does our checkout work on a 2019 Android over slow 3G?",
      description:
        "On an Android phone from 2019 or earlier, buy the $1 test item on fernway.example with throttled 3G. Record your screen and note anything slow or broken.",
      category: "remote",
      windowStart: ago(6),
      windowEnd: ago(3),
      payout: { kind: "fixed", amountCents: 2_500 },
      currency: "USD",
      proofSpec: [
        { label: "Screen recording", description: "The full checkout, start to finish", type: "video" },
        { label: "Notes", description: "What was slow or broken", type: "text" },
      ],
      verificationMode: "one_tap",
      challengeCode: "cobalt-55",
      status: "paid",
      funding: { state: "released", orderId: "SEED-ORDER-ANDROID", captureId: "SEED-CAP-ANDROID" },
      assigneeId: theo,
      tags: ["Remote", "User testing"],
    });

    await ctx.db.insert("tasks", {
      posterId: adi,
      postedVia: "mcp",
      agentLabel: "Claude (MCP)",
      title: "Pick up a repaired bike wheel from Spoke & Ember Cycles",
      brief: "Someone grab my wheel from the bike shop before 6.",
      description:
        "Pick up a repaired rear wheel (ticket #4471, already paid) from Spoke & Ember Cycles and drop it at the front desk of 2400 Folsom St. Photo of the ticket at pickup and the wheel at the desk.",
      category: "local",
      location: { label: "Spoke & Ember Cycles → 2400 Folsom St", lat: 37.7556, lng: -122.4211, radiusM: 800 },
      windowStart: now + 1 * HOUR,
      windowEnd: now + 6 * HOUR,
      payout: { kind: "fixed", amountCents: 2_200 },
      currency: "USD",
      proofSpec: [
        { label: "Pickup", description: "The repair ticket at the shop counter", type: "photo" },
        { label: "Drop-off", description: "The wheel at the front desk", type: "photo" },
      ],
      verificationMode: "one_tap",
      challengeCode: "ember-31",
      status: "open",
      funding: { state: "authorized", orderId: "SEED-ORDER-BIKE", authorizationId: "SEED-AUTH-BIKE" },
      tags: ["Errand", "Bike", "Today"],
    });

    // ── Applications ────────────────────────────────────────────────────────
    await ctx.db.insert("applications", {
      taskId: cafeTask, applicantId: rosa, viaAgent: false, askCents: 1_800,
      message: "I'm two blocks away and can be there by 3.",
      matchScore: 94, matchReason: "0.3 km away · 4.9 rating · 98% proof pass rate · asks the posted price",
      status: "pending",
    });
    await ctx.db.insert("applications", {
      taskId: cafeTask, applicantId: luis, viaAgent: true, askCents: 2_000,
      message: "Applied by Luis's agent: available 4–5pm, asking $2 above budget for the ride over.",
      matchScore: 81, matchReason: "2.1 km away · 4.7 rating · 93% pass rate · asked $2 above budget",
      status: "pending",
    });
    await ctx.db.insert("applications", {
      taskId: cafeTask, applicantId: theo, viaAgent: false, askCents: 1_800,
      message: "Can do it after 5.",
      matchScore: 62, matchReason: "Remote-first tester · 11 km away · late in the window",
      status: "pending",
    });
    for (const [applicant, ask, score] of [[rosa, 4_500, 90], [luis, 4_500, 86]] as const) {
      await ctx.db.insert("applications", {
        taskId: cleanupTask, applicantId: applicant, viaAgent: false, askCents: ask,
        message: "Count me in for Saturday.", matchScore: score,
        matchReason: "Local · strong proof record", status: "accepted",
      });
    }

    // ── Proof awaiting one-tap approval ─────────────────────────────────────
    const menusProof = await ctx.db.insert("proofs", {
      taskId: menusTask,
      workerId: rosa,
      items: [0, 1, 2].map((i) => ({ specIndex: i, capturedAt: ago(0, 3 - i), lat: 37.7524, lng: -122.4147 + i * 0.001 })),
      note: "Taquería Luna, El Comal Rojo and Casa Nopal. All menus current as of today.",
      status: "pass",
      verdict: {
        result: "pass",
        confidence: 0.96,
        summary: "All three menus are legible with prices, taken today within 400 m of 24th St. The challenge word is visible in photo 2.",
        checks: [
          { check: "Three distinct menus", passed: true, detail: "Three different taquerias, no repeated photo" },
          { check: "Prices legible", passed: true, detail: "Every price readable at full size" },
          { check: "Taken in the window", passed: true, detail: "Captured 1–3 hours ago" },
          { check: "At the location", passed: true, detail: "All within 400 m of 24th & Mission" },
          { check: "Challenge word", passed: true, detail: "“saffron-17” written on a card in photo 2" },
        ],
        model: "gemini-2.5-flash",
      },
    });

    // ── Adi's ledger: three weeks of receipts ───────────────────────────────
    const agent = "Claude (MCP)";
    type R = Parameters<typeof writeReceipt>[1];
    const r = (x: Omit<R, "ownerId" | "currency"> & { currency?: string }) =>
      writeReceipt(ctx, { currency: "USD", ownerId: adi, ...x } as R);

    // Coffee runs
    const coffees: Array<[number, number]> = [[0, 650], [1, 575], [2, 650], [4, 720], [6, 575], [8, 650], [11, 690], [13, 575], [15, 650], [18, 720]];
    for (const [d, cents] of coffees) {
      await r({
        kind: "purchase", amountCents: cents, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Kettle Corner",
        agentLabel: agent, why: "My usual oat flat white, ready at 8:30", category: "Food",
        rule: { source: "policy", text: "Food: up to $40 a day" }, state: "paid", occurredAt: ago(d, 15),
        paypal: { orderId: `SEED-KC-${d}`, captureId: `SEED-KC-CAP-${d}` },
      });
    }
    // Groceries and dinners
    for (const [d, cents, payee, why] of [
      [3, 3_840, "Mission Market", "Restock the basics for the week"],
      [10, 3_215, "Mission Market", "Restock the basics for the week"],
      [17, 3_690, "Mission Market", "Restock the basics for the week"],
      [5, 2_380, "Pho Saigon", "Dinner delivery, under $25"],
    ] as const) {
      await r({
        kind: "purchase", amountCents: cents, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: payee,
        agentLabel: agent, why, category: "Food",
        rule: { source: "policy", text: "Food: up to $40 a day" }, state: "paid", occurredAt: ago(d, 19),
      });
    }
    // The negotiated desk lamp (the demo's opening scene)
    await r({
      kind: "purchase", amountCents: 3_400, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Lumen & Oak",
      agentLabel: agent, why: "Buy a warm-white desk lamp under $40", category: "Shopping",
      rule: { source: "policy", text: "Shopping: up to $120 per purchase, ask over $50" },
      evidence: {
        savedCents: 600,
        transcript: [
          { from: "Adi's agent", text: "The Halden lamp is listed at $40. We'd buy today at $32." },
          { from: "Lumen & Oak's agent", text: "I can do $36, and free shipping." },
          { from: "Adi's agent", text: "$34 with free shipping and we'll check out now." },
          { from: "Lumen & Oak's agent", text: "Deal: $34, free shipping." },
        ],
      },
      state: "paid", occurredAt: ago(2, 13),
      paypal: { orderId: "SEED-LO-LAMP", captureId: "SEED-LO-LAMP-CAP" },
    });
    // Subscriptions and bills
    await r({
      kind: "subscription", amountCents: 499, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Cloudbox Storage",
      agentLabel: agent, why: "Storage plan renewal (was $2.99, now $4.99)", category: "Shopping",
      rule: { source: "approval", text: "You approved the new price on Oct 30" }, state: "paid", occurredAt: ago(6, 9),
    });
    // Task money
    await r({
      kind: "task_funding", amountCents: 1_800, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Plex (held)",
      agentLabel: agent, why: "Find someone to check whether the café on 5th has a quiet corner, and photograph the menu.",
      category: "Errands", taskId: cafeTask,
      rule: { source: "policy", text: "Errands: up to $50 per task, pay only on proof" },
      state: "held", occurredAt: ago(0, 2),
      paypal: { orderId: "SEED-ORDER-CAFE", authorizationId: "SEED-AUTH-CAFE" },
      timelineLabel: "Authorized; you're only charged when proof passes",
    });
    await r({
      kind: "task_funding", amountCents: 1_200, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Plex (held)",
      why: "Get me current menus for the taquerias on 24th between Mission and Folsom.",
      category: "Errands", taskId: menusTask,
      rule: { source: "policy", text: "Errands: up to $50 per task" },
      evidence: { proofId: menusProof, verdict: "Pass · 96% · 5 of 5 checks" },
      state: "held", occurredAt: ago(1, 6),
      paypal: { orderId: "SEED-ORDER-MENUS", captureId: "SEED-CAP-MENUS" },
    });
    await r({
      kind: "payout", amountCents: 2_200, payerLabel: "Plex", payeeId: luis, payeeLabel: "Luis Ortega",
      why: "Pick up dry cleaning on Valencia before 7pm", category: "Errands",
      rule: { source: "proof", text: "Proof passed · you approved with one tap" },
      evidence: { verdict: "Pass · 93% · 2 of 2 checks" },
      state: "released", occurredAt: ago(9, 18),
      paypal: { payoutBatchId: "SEED-BATCH-DRY", payoutItemId: "SEED-ITEM-DRY" },
    });
    await r({
      kind: "refund", amountCents: 1_400, payerLabel: "Plex", payeeId: adi, payeeLabel: "Adi Reddy",
      why: "Photograph the line at the DMV on Fell St (cancelled: office closed)", category: "Errands",
      rule: { source: "system", text: "Task cancelled before anyone took it" },
      state: "refunded", occurredAt: ago(12, 10), paypal: { captureId: "SEED-CAP-DMV", refundId: "SEED-REF-DMV" },
    });
    // Splits
    await r({
      kind: "invoice", amountCents: 13_980, payerLabel: "Maya, Jonah and Priya", payeeId: adi, payeeLabel: "Adi Reddy",
      agentLabel: agent, why: "Split last night's dinner with the people in that chat",
      category: "Food", rule: { source: "system", text: "Split from a photo of the bill, by what each person ordered" },
      state: "pending", occurredAt: ago(1, 3), paypal: { invoiceId: "SEED-INV-NOPA" },
    });
    await ctx.db.insert("splits", {
      ownerId: adi,
      title: "Dinner at Nopa",
      totalCents: 18_640,
      participants: [
        { name: "Maya Chen", userId: maya, shareCents: 4_920, invoiceId: "SEED-INV-NOPA-M", status: "paid" },
        { name: "Jonah Brooks", userId: jonah, shareCents: 4_480, invoiceId: "SEED-INV-NOPA-J", status: "sent" },
        { name: "Priya Nair", userId: priya, shareCents: 4_580, invoiceId: "SEED-INV-NOPA-P", status: "reminded" },
      ],
      occurredAt: ago(1, 3),
    });
    // Android test: Fernway's payout to Theo
    await writeReceipt(ctx, {
      kind: "payout", amountCents: 2_500, currency: "USD", ownerId: fernway, payerId: fernway, payerLabel: "Fernway",
      payeeId: theo, payeeLabel: "Theo Park", why: "Does our checkout work on a 2019 Android over slow 3G?",
      taskId: androidTask, rule: { source: "proof", text: "Proof passed · Fernway approved with one tap" },
      evidence: { verdict: "Pass · 91% · 2 of 2 checks" }, state: "released", occurredAt: ago(3, 2),
      paypal: { payoutBatchId: "SEED-BATCH-ANDROID" },
    });

    await seedLedgerHistory(ctx);
    await seedHireWorld(ctx, { adi, now });

    return `Seeded the demo world: Adi, 6 tasks, ${coffees.length + 12} receipts.`;
  },
});

/**
 * Local development: sign in as yourself and see the demo world. Moves a Clerk
 * login onto the seeded user Adi (and removes the empty row its first sign-in
 * made), so every screen has data. Run:
 * `pnpm --filter @plex/backend exec convex run seed:claimDemo '{"handle":"<your handle>"}'`.
 */
export const claimDemo = internalMutation({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const mine = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .unique();
    const adi = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", "adi"))
      .unique();
    if (!mine?.clerkId) return `No signed-in user with handle ${handle}.`;
    if (!adi) return "Seed the demo world first: pnpm seed.";
    const clerkId = mine.clerkId;
    await ctx.db.delete(mine._id);
    await ctx.db.patch(adi._id, { clerkId });
    return `Signed-in user ${handle} now acts as Adi.`;
  },
});

/**
 * Start from an empty world: deletes every row in every table (not just the
 * seeded ones), so the next sign-in creates a fresh, empty account. Run:
 * `pnpm --filter @plex/backend exec convex run seed:clear`. `pnpm seed` brings
 * the demo world back.
 */
export const clear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of Object.keys(schema.tables) as TableNames[]) {
      const docs = await ctx.db.query(table).collect();
      for (const doc of docs) await ctx.db.delete(doc._id);
      if (docs.length) counts[table] = docs.length;
    }
    return counts;
  },
});
