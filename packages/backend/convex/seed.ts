import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { advanceReceipt, writeReceipt } from "./lib/receipts";
import { seedLedgerHistory } from "./lib/ledgerSeed";
import { seedHireWorld } from "./lib/hireSeed";
import { nextRunAt, type RoutineTrigger } from "./lib/schedule";

/**
 * The demo world (docs/Plex-Project-Plan.md §9). All brands, people and the
 * NGO are invented. Run with `pnpm seed`; pass `{"reset": true}` to wipe and
 * rebuild: `pnpm --filter @plex/backend exec convex run seed:run '{"reset":true}'`.
 */

const TABLES: TableNames[] = [
  "users", "agents", "pots", "approvals", "receipts", "tasks", "applications",
  "proofs", "causes", "donations", "campaigns", "campaignEntries", "splits", "webhookEvents",
  "ledgerAsks", "ledgerWidgets", "ledgerActions",
  "routines", "routineRuns", "asks", "memories", "bills", "subscriptions", "agentActivity", "insights",
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
    await ctx.db.insert("agents", { ownerId: adi, name: "Plex for Mac", kind: "mac" });
    await ctx.db.insert("agents", {
      ownerId: adi,
      name: "Claude (MCP)",
      kind: "mcp",
      keyPrefix: "plx_live_7Qm",
    });

    // ── Pots and rules ──────────────────────────────────────────────────────
    const food = await ctx.db.insert("pots", {
      ownerId: adi,
      name: "Food",
      icon: "coffee",
      color: "green",
      balanceCents: 21_450,
      spentTodayCents: 1_300,
      spentMonthCents: 38_550,
      monthlyBudgetCents: 60_000,
      rulesText: "Food up to $40 a day. Ask me before anything over $25. No spending after midnight.",
      rules: [
        { kind: "daily_limit", amountCents: 4_000 },
        { kind: "approval_over", amountCents: 2_500 },
        { kind: "quiet_hours", startHour: 0, endHour: 6 },
      ],
    });
    const shopping = await ctx.db.insert("pots", {
      ownerId: adi,
      name: "Shopping",
      icon: "shopping-bag",
      color: "blue",
      balanceCents: 31_600,
      spentTodayCents: 0,
      spentMonthCents: 8_400,
      monthlyBudgetCents: 40_000,
      rulesText: "Up to $120 per purchase. Ask me before anything over $50. Never buy subscriptions without asking.",
      rules: [
        { kind: "per_purchase_limit", amountCents: 12_000 },
        { kind: "approval_over", amountCents: 5_000 },
        { kind: "block_category", category: "subscriptions" },
      ],
    });
    const errands = await ctx.db.insert("pots", {
      ownerId: adi,
      name: "Errands",
      icon: "map-pin",
      color: "teal",
      balanceCents: 11_200,
      spentTodayCents: 0,
      spentMonthCents: 6_300,
      monthlyBudgetCents: 20_000,
      rulesText: "Up to $50 per task. Pay only when proof passes.",
      rules: [{ kind: "per_purchase_limit", amountCents: 5_000 }],
    });
    const giving = await ctx.db.insert("pots", {
      ownerId: adi,
      name: "Giving",
      icon: "heart-handshake",
      color: "steel",
      balanceCents: 4_060,
      spentTodayCents: 0,
      spentMonthCents: 2_560,
      monthlyBudgetCents: 5_000,
      rulesText: "Send 10% of what my agent saves to Lakeside Commons. Up to $50 a month.",
      rules: [{ kind: "monthly_limit", amountCents: 5_000 }],
    });

    // ── Cause ───────────────────────────────────────────────────────────────
    const cause = await ctx.db.insert("causes", {
      orgId: lakeside,
      slug: "lake-merritt-shoreline",
      name: "A clean Lake Merritt shoreline",
      tagline: "Every donation pays a local person for a cleanup shift, with photos to prove it.",
      story: [
        "Lake Merritt's 3.4-mile shore collects litter after every warm weekend, and storm drains wash more in each rain.",
        "Lakeside Commons organizes weekly cleanup shifts along the east and north shores. Instead of relying only on volunteers, each shift now pays local residents $15 an hour.",
        "**Where the money goes:** $45 pays one person for a 3-hour shift. Gloves, grabbers and bags are already covered by a city grant.",
        "**How you'll know:** every shift ends with before-and-after photos at a marked spot, checked by Plex before anyone is paid. You get the photos.",
      ].join("\n\n"),
      location: { label: "Lake Merritt, Oakland", lat: 37.8024, lng: -122.2589 },
      coverHue: 168,
      goalCents: 600_000,
      raisedCents: 384_000,
      donorsCount: 128,
      workersPaidCount: 37,
      tags: ["Environment", "Local jobs", "Oakland"],
      status: "live",
    });

    // ── Tasks ───────────────────────────────────────────────────────────────
    const errandSpec = [
      { label: "Storefront", description: "The café's front, with its sign readable", type: "photo" as const },
      { label: "Menu", description: "The full drinks and food menu, legible", type: "photo" as const },
      { label: "Seating area", description: "The quietest corner, showing outlets if any", type: "photo" as const },
    ];
    const cafeTask = await ctx.db.insert("tasks", {
      posterId: adi,
      postedVia: "mac",
      agentLabel: "Plex for Mac",
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
      causeId: cause,
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
      postedVia: "mac",
      agentLabel: "Plex for Mac",
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

    // ── Campaign ────────────────────────────────────────────────────────────
    const campaign = await ctx.db.insert("campaigns", {
      brandId: fernway,
      name: "Tell the lake's story",
      brief: "Short videos about Lake Merritt cleanups. Fernway pays per verified view and matches it to Lakeside Commons.",
      rule: { kind: "per_result", perThousandViewsCents: 400, bonusAtViews: 25_000, bonusCents: 5_000, capCents: 30_000 },
      causeId: cause,
      budgetCents: 300_000,
      spentCents: 41_280,
      status: "live",
    });
    for (const [creator, views, url] of [
      [kenji, 18_400, "https://youtube.com/shorts/demo-kenji"],
      [rosa, 6_250, "https://youtube.com/shorts/demo-rosa"],
      [luis, 2_900, "https://youtube.com/shorts/demo-luis"],
    ] as const) {
      const earned = Math.min(Math.floor(views / 1000) * 400 + (views >= 25_000 ? 5_000 : 0), 30_000);
      await ctx.db.insert("campaignEntries", {
        campaignId: campaign, creatorId: creator, postUrl: url, platform: "YouTube",
        views, earnedCents: earned, paidCents: Math.floor(earned * 0.6),
      });
    }

    // ── Donations to the cause ──────────────────────────────────────────────
    const donors = ["Adi R.", "Sam K.", "Leah M.", "Anonymous", "Marcus T.", "Ines P.", "Dev S.", "Hana W."];
    for (let i = 0; i < donors.length; i++) {
      await ctx.db.insert("donations", {
        causeId: cause,
        donorId: i === 0 ? adi : undefined,
        donorLabel: donors[i],
        amountCents: [2_500, 4_500, 10_000, 1_500, 4_500, 2_000, 9_000, 4_500][i],
        recurring: i % 3 === 1,
        source: i === 3 ? "saved_for_good" : "direct",
        taskId: i % 2 === 0 ? cleanupTask : undefined,
      });
    }

    // ── Causes: more of the demo world ──────────────────────────────────────
    // (Plex Causes session) The unit of work, two more causes with Impact
    // Tasks, and a finished shift whose proof passed, so Proof Reels have
    // something real to show. No media is seeded: proof photos only ever come
    // from a worker's upload.
    if (reset) {
      for (const doc of await ctx.db.query("donationCheckouts").collect()) await ctx.db.delete(doc._id);
    }
    await ctx.db.patch(cause, { unitCents: 4_500, unitLabel: "pays one person for a 3-hour shift" });

    // Shifts happen at real local hours in Pacific time (daylight time
    // included) on the weekday their title names.
    const ptParts = (ms: number) =>
      Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          hourCycle: "h23",
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          weekday: "short",
        })
          .formatToParts(ms)
          .map((x) => [x.type, x.value]),
      ) as Record<string, string>;
    const ptDate = (ms: number) => {
      const p = ptParts(ms);
      return Date.UTC(+p.year, +p.month - 1, +p.day);
    };
    // Wall-clock hour on a PT date (as UTC midnight) to an instant.
    const ptAt = (date: number, hour: number) => {
      const guess = date + hour * HOUR;
      const p = ptParts(guess);
      const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - guess;
      return guess - offset;
    };
    const ptDow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(ptParts(now).weekday);
    const nextDay = (dow: number, hour: number) => ptAt(ptDate(now) + (((dow - ptDow + 7) % 7) || 7) * DAY, hour);
    const lastDay = (dow: number, hour: number) => ptAt(ptDate(now) - (((ptDow - dow + 7) % 7) || 7) * DAY, hour);
    await ctx.db.patch(cleanupTask, { windowStart: nextDay(6, 9), windowEnd: nextDay(6, 12) });

    const marisol = await person("marisol", "Marisol Vega", "#A4508B", {
      area: "Eastlake, Oakland",
      bio: "Lives two blocks from the lake. Weekend cleanup shifts.",
      skills: ["Cleanup", "Outdoors"],
      rating: 4.9,
      proofPassRate: 1,
      tasksCompleted: 11,
    });
    const dwayne = await person("dwayne", "Dwayne Harris", "#4F7CAC", {
      area: "West Oakland",
      bio: "Retired city gardener. Trees and irrigation.",
      skills: ["Watering", "Gardening"],
      rating: 4.8,
      proofPassRate: 0.97,
      tasksCompleted: 29,
    });

    const fridgeOrg = await ctx.db.insert("users", {
      handle: "mission-fridge",
      name: "Mission Fridge Collective",
      kind: "org",
      avatarColor: "#B5652B",
      bio: "Neighbors running three free community fridges on 24th St since 2020.",
      area: "Mission, San Francisco",
      isDemo: true,
    });
    const canopyOrg = await ctx.db.insert("users", {
      handle: "west-oakland-canopy",
      name: "West Oakland Canopy",
      kind: "org",
      avatarColor: "#3E7D4F",
      bio: "Plants and waters street trees with block captains in West Oakland.",
      area: "West Oakland, CA",
      isDemo: true,
    });

    const fridgeCause = await ctx.db.insert("causes", {
      orgId: fridgeOrg,
      slug: "mission-community-fridges",
      name: "Stocked community fridges on 24th St",
      tagline: "Pays neighbors to restock and clean three free fridges, with a photo and a temperature reading each shift.",
      story: [
        "Three free fridges on 24th St are emptied most days by 2pm. Grocers donate surplus each morning, but someone has to collect it, sort it and keep the fridges clean and cold.",
        "Mission Fridge Collective pays neighbors $15 an hour for two-hour restock shifts, so the work doesn't depend on who has a free afternoon.",
        "**Where the money goes:** $30 pays one person for a 2-hour restock and clean. The food itself is donated.",
        "**How you'll know:** each shift ends with a photo of the stocked shelves and the thermometer, checked by Plex before anyone is paid.",
      ].join("\n\n"),
      location: { label: "24th St & Folsom, San Francisco", lat: 37.7527, lng: -122.4146 },
      coverHue: 32,
      goalCents: 240_000,
      raisedCents: 91_000,
      donorsCount: 41,
      workersPaidCount: 12,
      tags: ["Food", "Local jobs", "San Francisco"],
      status: "live",
      unitCents: 3_000,
      unitLabel: "pays one person for a 2-hour restock shift",
    });
    const treesCause = await ctx.db.insert("causes", {
      orgId: canopyOrg,
      slug: "west-oakland-street-trees",
      name: "Watered street trees in West Oakland",
      tagline: "Pays local people to water young street trees through their first three dry seasons.",
      story: [
        "Young street trees need about 15 gallons a week through the dry months for their first three years. Without it, many don't make it to year four.",
        "West Oakland Canopy pays residents to walk a watering route with a cart and a tank, about 30 trees in two and a half hours.",
        "**Where the money goes:** $40 pays one person to water one route of 30 trees. Water and carts are covered by the city.",
        "**How you'll know:** a photo of each route's first and last tree, with the watering tag filled in, checked before anyone is paid.",
      ].join("\n\n"),
      location: { label: "Mandela Pkwy, West Oakland", lat: 37.8125, lng: -122.2905 },
      coverHue: 118,
      goalCents: 360_000,
      raisedCents: 126_000,
      donorsCount: 52,
      workersPaidCount: 9,
      tags: ["Environment", "Local jobs", "Oakland"],
      status: "live",
      unitCents: 4_000,
      unitLabel: "pays one person to water a route of 30 trees",
    });

    const impact = (x: {
      posterId: Id<"users">; causeId: Id<"causes">; title: string; brief: string; description: string;
      location: { label: string; lat: number; lng: number; radiusM: number }; start: number; hours: number;
      cents: number; spots: number; proof: Array<[string, string]>; code: string; tags: string[];
      status?: "open" | "paid"; funded?: "captured" | "released"; assigneeId?: Id<"users">;
    }) =>
      ctx.db.insert("tasks", {
        posterId: x.posterId, postedVia: "web", title: x.title, brief: x.brief, description: x.description,
        category: "impact", location: x.location, windowStart: x.start, windowEnd: x.start + x.hours * HOUR,
        payout: { kind: "fixed", amountCents: x.cents }, currency: "USD",
        proofSpec: x.proof.map(([label, description]) => ({ label, description, type: "photo" as const })),
        verificationMode: "auto", challengeCode: x.code, status: x.status ?? "open",
        funding: { state: x.funded ?? "captured", orderId: `SEED-ORDER-${x.code}`, captureId: `SEED-CAP-${x.code}` },
        causeId: x.causeId, spots: x.spots, tags: x.tags, assigneeId: x.assigneeId,
      });

    await impact({
      posterId: lakeside, causeId: cause, title: "Sunday storm-drain sweep, north shore",
      brief: "Clear the 6 storm-drain grates on the north shore before Monday's rain: 2 people × 3 hours, $15 an hour each.",
      description: "Meet at the Grand Ave boat launch at 10am. Clear litter from the six marked storm-drain grates between the launch and Children's Fairyland. Before and after photo at each grate.",
      location: { label: "Grand Ave boat launch, Oakland", lat: 37.8098, lng: -122.2552, radiusM: 400 },
      start: nextDay(0, 10), hours: 3, cents: 4_500, spots: 2, code: "harbor-51",
      proof: [["Before", "Each marked grate before you start"], ["After", "The same grate after clearing"]],
      tags: ["Impact", "Outdoors", "Sunday"],
    });
    await impact({
      posterId: fridgeOrg, causeId: fridgeCause, title: "Tuesday restock and clean, 24th St fridges",
      brief: "Collect donations from 3 grocers, restock and wipe down the fridges: 2 people × 2 hours, $15 an hour.",
      description: "Pick up the crates at Mission Market and Casa Nopal at 8am, sort out anything past date, restock the three fridges and wipe the shelves. Photo of each stocked fridge with its thermometer.",
      location: { label: "24th St & Folsom, San Francisco", lat: 37.7527, lng: -122.4146, radiusM: 300 },
      start: nextDay(2, 8), hours: 2, cents: 3_000, spots: 2, code: "meadow-24",
      proof: [["Stocked shelves", "Each fridge, door open, after restocking"], ["Thermometer", "The reading inside each fridge"]],
      tags: ["Impact", "Food", "Tuesday"],
    });
    await impact({
      posterId: canopyOrg, causeId: treesCause, title: "Saturday watering route, Mandela Pkwy",
      brief: "Walk the Mandela Pkwy route with the water cart: 3 routes, $40 each.",
      description: "Collect the cart at the 18th St yard. Give each of the 30 tagged trees 15 gallons and initial its watering tag. Photo of the first and last tree on your route, tag visible.",
      location: { label: "Mandela Pkwy & 18th St, Oakland", lat: 37.8125, lng: -122.2905, radiusM: 600 },
      start: nextDay(6, 8), hours: 3, cents: 4_000, spots: 3, code: "juniper-38",
      proof: [["First tree", "The first tree on your route, tag filled in"], ["Last tree", "The last tree, tag filled in"]],
      tags: ["Impact", "Outdoors", "Weekend"],
    });

    // A finished shift: proof passed, three people paid. This is Adi's Proof Reel.
    const pastStart = lastDay(6, 9); // last Saturday, 9am
    const pastTask = await impact({
      posterId: lakeside, causeId: cause, title: "Saturday shoreline cleanup, north shore",
      brief: "Lake shore cleanup, Saturday: 3 people × 3 hours, $15 an hour each.",
      description: "Meet at the Pergola at 9am. Three hours clearing litter along the north shore to the boathouse. A photo of the cleared shore from the marked post, and what you collected at the pickup point.",
      location: { label: "Lake Merritt Pergola, Oakland", lat: 37.8093, lng: -122.2498, radiusM: 300 },
      start: pastStart, hours: 3, cents: 4_500, spots: 3, code: "cobalt-19",
      proof: [["After", "The cleared shore, from the marked post"], ["Bags", "What you collected, at the pickup point"]],
      tags: ["Impact", "Outdoors", "Saturday"], status: "paid", funded: "released", assigneeId: marisol,
    });
    for (const w of [marisol, rosa, luis]) {
      await ctx.db.insert("applications", {
        taskId: pastTask, applicantId: w, viaAgent: false, askCents: 4_500,
        message: "I'll be there at 9.", matchScore: 88, matchReason: "Local · strong proof record", status: "accepted",
      });
    }
    const pastProof = await ctx.db.insert("proofs", {
      taskId: pastTask,
      workerId: marisol,
      // Openly licensed stand-in photos (credits in apps/web/public/demo/reel/CREDITS.md).
      items: ["/demo/reel/lake-merritt-shore.jpg", "/demo/reel/collected-debris.jpg"].map((url, i) => ({
        specIndex: i, url, capturedAt: pastStart + 2 * HOUR + 50 * 60_000 + i * 60_000, lat: 37.8093, lng: -122.2498,
      })),
      note: "Eleven bags from the Pergola to the boathouse. Most of it was takeout packaging by the benches.",
      status: "pass",
      verdict: {
        result: "pass",
        confidence: 0.94,
        summary: "The after photo is taken from the marked post inside the window, and the collected litter is at the pickup point. The worker confirmed the challenge word.",
        checks: [
          { check: "After, from the marked post", passed: true, detail: "Same view as the post's reference photo" },
          { check: "Taken in the window", passed: true, detail: "11:50am and 11:51am on Saturday" },
          { check: "At the location", passed: true, detail: "Within 120 m of the Pergola" },
          { check: "Challenge word", passed: true, detail: "Worker confirmed “cobalt-19” at the pickup point" },
          { check: "Original photos", passed: true, detail: "No match with earlier submissions" },
        ],
        model: "gemini-2.5-flash",
      },
      decision: "approved",
    });
    const paidAt = pastStart + 4 * HOUR;
    for (const [w, name] of [[marisol, "Marisol Vega"], [rosa, "Rosa Delgado"], [luis, "Luis Ortega"]] as const) {
      await writeReceipt(ctx, {
        kind: "payout", amountCents: 4_500, currency: "USD", ownerId: lakeside, payerId: lakeside,
        payerLabel: "Lakeside Commons", payeeId: w, payeeLabel: name,
        why: "Lake shore cleanup, Saturday: 3 people × 3 hours, $15 an hour each.", taskId: pastTask, causeId: cause,
        rule: { source: "proof", text: "Proof passed · 5 of 5 checks · paid automatically" },
        evidence: { proofId: pastProof, verdict: "Pass · 94% · 5 of 5 checks" },
        state: "released", occurredAt: paidAt, timelineLabel: "Released through PayPal Payouts",
        paypal: { payoutBatchId: "SEED-BATCH-NORTHSHORE" },
      });
    }
    for (const [label, cents, donor] of [["Adi Reddy", 4_500, adi], ["Leah M.", 4_500, undefined], ["Ines P.", 4_500, undefined]] as const) {
      const receiptId = donor
        ? await writeReceipt(ctx, {
            kind: "donation", amountCents: cents, currency: "USD", ownerId: donor, payerId: donor, payerLabel: label,
            payeeId: lakeside, payeeLabel: "Lakeside Commons", why: "Fund one shift at the lake",
            rule: { source: "donor", text: "You chose this shift. Plex holds the money until its proof passes." },
            state: "held", occurredAt: ago(9, 4), timelineLabel: "Held by Plex until the shift's proof passes",
            causeId: cause, taskId: pastTask, category: "Giving", potId: giving,
          })
        : undefined;
      if (receiptId) {
        await advanceReceipt(ctx, receiptId, "released", "Released: the shift's proof passed", {
          evidence: { proofId: pastProof, verdict: "Pass · 94% · 5 of 5 checks" },
        });
      }
      await ctx.db.insert("donations", {
        causeId: cause, donorId: donor, donorLabel: label, amountCents: cents, taskId: pastTask,
        recurring: false, source: "direct", receiptId,
      });
    }

    // A few gifts to the other causes, for their feeds.
    for (const [c, label, cents] of [
      [fridgeCause, "Tomas R.", 3_000], [fridgeCause, "Anonymous", 6_000], [fridgeCause, "June L.", 1_500],
      [treesCause, "Priya N.", 4_000], [treesCause, "Ruth A.", 8_000], [treesCause, "Anonymous", 2_000],
    ] as const) {
      await ctx.db.insert("donations", { causeId: c, donorLabel: label, amountCents: cents, recurring: false, source: "direct" });
    }

    // ── Adi's ledger: three weeks of receipts ───────────────────────────────
    const mac = "Plex for Mac";
    type R = Parameters<typeof writeReceipt>[1];
    const r = (x: Omit<R, "ownerId" | "currency"> & { currency?: string }) =>
      writeReceipt(ctx, { currency: "USD", ownerId: adi, ...x } as R);

    // Coffee runs
    const coffees: Array<[number, number]> = [[0, 650], [1, 575], [2, 650], [4, 720], [6, 575], [8, 650], [11, 690], [13, 575], [15, 650], [18, 720]];
    for (const [d, cents] of coffees) {
      await r({
        kind: "purchase", amountCents: cents, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Kettle Corner",
        agentLabel: mac, why: "My usual oat flat white, ready at 8:30", category: "Food", potId: food,
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
        agentLabel: mac, why, category: "Food", potId: food,
        rule: { source: "policy", text: "Food: up to $40 a day" }, state: "paid", occurredAt: ago(d, 19),
      });
    }
    // The negotiated desk lamp (the demo's opening scene)
    await r({
      kind: "purchase", amountCents: 3_400, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Lumen & Oak",
      agentLabel: mac, why: "Buy a warm-white desk lamp under $40", category: "Shopping", potId: shopping,
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
    await r({
      kind: "donation", amountCents: 60, payerId: adi, payerLabel: "Adi Reddy", payeeId: lakeside,
      payeeLabel: "Lakeside Commons", agentLabel: mac, why: "10% of what the agent saved on the desk lamp",
      category: "Giving", potId: giving, causeId: cause,
      rule: { source: "policy", text: "Giving: send 10% of savings to Lakeside Commons" },
      state: "paid", occurredAt: ago(2, 13),
    });
    // Subscriptions and bills
    await r({
      kind: "subscription", amountCents: 499, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Cloudbox Storage",
      agentLabel: mac, why: "Storage plan renewal (was $2.99, now $4.99)", category: "Shopping", potId: shopping,
      rule: { source: "approval", text: "You approved the new price on Oct 30" }, state: "paid", occurredAt: ago(6, 9),
    });
    // Task money
    await r({
      kind: "task_funding", amountCents: 1_800, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Plex (held)",
      agentLabel: mac, why: "Find someone to check whether the café on 5th has a quiet corner, and photograph the menu.",
      category: "Errands", potId: errands, taskId: cafeTask,
      rule: { source: "policy", text: "Errands: up to $50 per task, pay only on proof" },
      state: "held", occurredAt: ago(0, 2),
      paypal: { orderId: "SEED-ORDER-CAFE", authorizationId: "SEED-AUTH-CAFE" },
      timelineLabel: "Authorized; you're only charged when proof passes",
    });
    await r({
      kind: "task_funding", amountCents: 1_200, payerId: adi, payerLabel: "Adi Reddy", payeeLabel: "Plex (held)",
      why: "Get me current menus for the taquerias on 24th between Mission and Folsom.",
      category: "Errands", potId: errands, taskId: menusTask,
      rule: { source: "policy", text: "Errands: up to $50 per task" },
      evidence: { proofId: menusProof, verdict: "Pass · 96% · 5 of 5 checks" },
      state: "held", occurredAt: ago(1, 6),
      paypal: { orderId: "SEED-ORDER-MENUS", captureId: "SEED-CAP-MENUS" },
    });
    await r({
      kind: "payout", amountCents: 2_200, payerLabel: "Plex", payeeId: luis, payeeLabel: "Luis Ortega",
      why: "Pick up dry cleaning on Valencia before 7pm", category: "Errands", potId: errands,
      rule: { source: "proof", text: "Proof passed · you approved with one tap" },
      evidence: { verdict: "Pass · 93% · 2 of 2 checks" },
      state: "released", occurredAt: ago(9, 18),
      paypal: { payoutBatchId: "SEED-BATCH-DRY", payoutItemId: "SEED-ITEM-DRY" },
    });
    await r({
      kind: "refund", amountCents: 1_400, payerLabel: "Plex", payeeId: adi, payeeLabel: "Adi Reddy",
      why: "Photograph the line at the DMV on Fell St (cancelled: office closed)", category: "Errands", potId: errands,
      rule: { source: "system", text: "Task cancelled before anyone took it" },
      state: "refunded", occurredAt: ago(12, 10), paypal: { captureId: "SEED-CAP-DMV", refundId: "SEED-REF-DMV" },
    });
    // Splits
    await r({
      kind: "invoice", amountCents: 13_980, payerLabel: "Maya, Jonah and Priya", payeeId: adi, payeeLabel: "Adi Reddy",
      agentLabel: mac, why: "Split last night's dinner with the people in that chat",
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
    // A donation Adi made directly
    await r({
      kind: "donation", amountCents: 2_500, payerId: adi, payerLabel: "Adi Reddy", payeeId: lakeside,
      payeeLabel: "Lakeside Commons", why: "Fund half of a Saturday cleanup shift", category: "Giving",
      potId: giving, causeId: cause, taskId: cleanupTask,
      rule: { source: "donor", text: "You chose this shift" }, state: "held", occurredAt: ago(4, 20),
      timelineLabel: "Held until the shift's proof passes",
    });

    // Android test: Fernway's payout to Theo (in the cause/brand world)
    await writeReceipt(ctx, {
      kind: "payout", amountCents: 2_500, currency: "USD", ownerId: fernway, payerId: fernway, payerLabel: "Fernway",
      payeeId: theo, payeeLabel: "Theo Park", why: "Does our checkout work on a 2019 Android over slow 3G?",
      taskId: androidTask, rule: { source: "proof", text: "Proof passed · Fernway approved with one tap" },
      evidence: { verdict: "Pass · 91% · 2 of 2 checks" }, state: "released", occurredAt: ago(3, 2),
      paypal: { payoutBatchId: "SEED-BATCH-ANDROID" },
    });

    // ── A pending approval card ─────────────────────────────────────────────
    await ctx.db.insert("approvals", {
      ownerId: adi,
      potId: shopping,
      agentLabel: mac,
      description: "Ergonomic desk chair, oak and wool",
      merchant: "Lumen & Oak",
      amountCents: 6_000,
      ruleText: "Ask before anything over $50",
      status: "pending",
    });

    // ── Causes: link Adi's seeded shift gift to its receipt ─────────────────
    {
      const held = (await ctx.db.query("receipts").withIndex("by_task", (q) => q.eq("taskId", cleanupTask)).collect())
        .find((x) => x.kind === "donation" && x.payerId === adi);
      const gift = (await ctx.db.query("donations").withIndex("by_task", (q) => q.eq("taskId", cleanupTask)).collect())
        .find((d) => d.donorId === adi);
      if (held && gift) await ctx.db.patch(gift._id, { receiptId: held._id });
    }

    await seedLedgerHistory(ctx);
    await seedMacWorld(ctx, { adi, now });
    await seedHireWorld(ctx, { adi, now });

    return `Seeded the demo world: Adi, ${donors.length} donors, 6 tasks, ${coffees.length + 14} receipts.`;
  },
});

// ── Plex for Mac: bills, subscriptions, routines, memory, asks, activity ─────

const MAC_TZ = "America/Los_Angeles";
const MAC = "Plex for Mac";

type StepSeed = [kind: "info" | "tool" | "money" | "ask" | "done" | "error", label: string, detail?: string];

/**
 * Adi's world as Plex for Mac sees it (docs/plex-mac.md §2 "Seed"). Every
 * payee, shop and person is invented. Memories are stored with an empty
 * embedding: the brain embeds them on its first loop (`memory:core` lists
 * them under `needsEmbedding`). Runs on every `seed:run`; `reset` wipes the
 * tables first.
 */
async function seedMacWorld(ctx: MutationCtx, { adi, now }: { adi: Id<"users">; now: number }) {
  if (await ctx.db.query("routines").first()) return;
  const ago = (days: number, hours = 0) => now - days * DAY - hours * HOUR;
  const inDays = (days: number, hours = 0) => now + days * DAY + hours * HOUR;
  const MIN = 60_000;

  // ── Two more pots: Bills and Work ─────────────────────────────────────────
  const bills = await ctx.db.insert("pots", {
    ownerId: adi,
    name: "Bills",
    icon: "receipt",
    color: "blue",
    balanceCents: 264_000,
    spentTodayCents: 0,
    spentMonthCents: 185_000,
    monthlyBudgetCents: 300_000,
    rulesText:
      "Pay my bills from here, up to $3,000 a month. Ask me before anything over $100. Pay Sam Okafor up to $1,850 for rent without asking.",
    rules: [
      { kind: "monthly_limit", amountCents: 300_000 },
      { kind: "approval_over", amountCents: 10_000 },
      { kind: "auto_approve", merchant: "Sam Okafor", upToCents: 185_000 },
    ],
  });
  const work = await ctx.db.insert("pots", {
    ownerId: adi,
    name: "Work",
    icon: "briefcase",
    color: "teal",
    balanceCents: 214_000,
    spentTodayCents: 0,
    spentMonthCents: 54_000,
    monthlyBudgetCents: 300_000,
    rulesText: "Pass Lena her 30% when a client pays, up to $3,000 a month. Ask me before anything over $1,000.",
    rules: [
      { kind: "monthly_limit", amountCents: 300_000 },
      { kind: "approval_over", amountCents: 100_000 },
    ],
  });

  // ── Savings: where routines sweep what's left ─────────────────────────────
  await ctx.db.insert("pots", {
    ownerId: adi,
    name: "Savings",
    icon: "piggy-bank",
    color: "green",
    balanceCents: 412_000,
    spentTodayCents: 0,
    spentMonthCents: 0,
    monthlyBudgetCents: 0,
    rulesText: "Money I set aside. Plex can move money in, but never spends from here without asking.",
    rules: [{ kind: "approval_over", amountCents: 0 }],
  });

  // ── Tax: what the freelance work sets aside for quarterly estimated tax ────
  await ctx.db.insert("pots", {
    ownerId: adi,
    name: "Tax",
    icon: "landmark",
    color: "steel",
    balanceCents: 234_000,
    spentTodayCents: 0,
    spentMonthCents: 0,
    monthlyBudgetCents: 0,
    rulesText: "Set aside for quarterly estimated tax. Plex can move money in, never spends from here without asking.",
    rules: [{ kind: "approval_over", amountCents: 0 }],
  });

  // ── Receipts the routines left behind ─────────────────────────────────────
  const paid = async (x: {
    payee: string;
    cents: number;
    why: string;
    pot: Id<"pots">;
    potName: string;
    rule: string;
    at: number;
    key: string;
  }) => {
    const id = await writeReceipt(ctx, {
      kind: "payout",
      amountCents: x.cents,
      currency: "USD",
      ownerId: adi,
      payerId: adi,
      payerLabel: "Adi Reddy",
      payeeLabel: x.payee,
      agentLabel: MAC,
      why: x.why,
      rule: { source: "policy", text: `${x.potName}: ${x.rule}` },
      state: "paid",
      potId: x.pot,
      category: x.potName,
      occurredAt: x.at,
      paypal: { payoutBatchId: `SEED-BATCH-${x.key}`, payoutItemId: `SEED-ITEM-${x.key}` },
    });
    await ctx.db.patch(id, {
      timeline: [
        { at: x.at, label: `Allowed by the ${x.potName} pot: ${x.rule}`, state: "pending" },
        { at: x.at + 4_000, label: "Sent by PayPal Payouts (pending)", state: "released" },
        { at: x.at + 40_000, label: `Landed in ${x.payee}'s PayPal`, state: "paid" },
      ],
    });
    return id;
  };

  const rentWhy = "When Maya and Jonah have both paid their share of rent, pay Sam the full $1,850 from Bills.";
  const rentOct = await paid({
    payee: "Sam Okafor", cents: 185_000, why: rentWhy, pot: bills, potName: "Bills",
    rule: "Pay Sam Okafor up to $1,850 without asking", at: ago(35, 1), key: "RENT-OCT",
  });
  const rentNov = await paid({
    payee: "Sam Okafor", cents: 185_000, why: rentWhy, pot: bills, potName: "Bills",
    rule: "Pay Sam Okafor up to $1,850 without asking", at: ago(5, 9), key: "RENT-NOV",
  });
  const utilWhy = "Pay Pacific Power and Northwave from Bills two days before they're due. Ask me if one is 20% over the usual.";
  const powerOct = await paid({
    payee: "Pacific Power", cents: 9_410, why: utilWhy, pot: bills, potName: "Bills",
    rule: "Up to $3,000 a month", at: ago(33, 2), key: "POWER-OCT",
  });
  const netOct = await paid({
    payee: "Northwave Internet", cents: 7_900, why: utilWhy, pot: bills, potName: "Bills",
    rule: "Up to $3,000 a month", at: ago(30, 6), key: "NET-OCT",
  });
  const lenaWhy = "When a client pays one of my illustration invoices, send Lena her 30%.";
  const lenaOct = await paid({
    payee: "Lena Varga", cents: 36_000, why: lenaWhy, pot: work, potName: "Work",
    rule: "Up to $3,000 a month", at: ago(17, 3), key: "LENA-HALCYON",
  });
  const lenaNov = await paid({
    payee: "Lena Varga", cents: 54_000, why: lenaWhy, pot: work, potName: "Work",
    rule: "Up to $3,000 a month", at: ago(3, 6), key: "LENA-MOSS",
  });

  // ── Bills ─────────────────────────────────────────────────────────────────
  const rentDue = nextRunAt({ kind: "schedule", cadence: "monthly", dayOfMonth: 1, time: "09:00" }, MAC_TZ, now)!;
  await ctx.db.insert("bills", {
    ownerId: adi, payee: "Sam Okafor", payeeEmail: "sam.okafor@example.com", category: "Rent",
    amountCents: 185_000, usualCents: 185_000, dueAt: rentDue, status: "upcoming", autopay: false, source: "manual",
    note: "Paid by the rent routine once Maya and Jonah have sent their shares",
  });
  await ctx.db.insert("bills", {
    ownerId: adi, payee: "Northwave Internet", payeeEmail: "billing@northwave.example.com", category: "Internet",
    amountCents: 8_420, usualCents: 7_900, dueAt: inDays(3), status: "upcoming", autopay: false, source: "email",
    note: "Up $5.20: the 12-month promo price ended",
  });
  await ctx.db.insert("bills", {
    ownerId: adi, payee: "Pacific Power", payeeEmail: "billing@pacificpower.example.com", category: "Utilities",
    amountCents: 21_200, usualCents: 9_600, dueAt: inDays(5), status: "upcoming", autopay: false, source: "email",
    note: "More than double the usual: heating since the cold snap",
  });
  await ctx.db.insert("bills", {
    ownerId: adi, payee: "Brightline Mobile", payeeEmail: "billing@brightline.example.com", category: "Phone",
    amountCents: 6_214, usualCents: 6_200, dueAt: inDays(9), status: "upcoming", autopay: false, source: "manual",
    note: "No emailed bill: the balance is on Brightline's account page",
  });
  await ctx.db.insert("bills", {
    ownerId: adi, payee: "Harbor Mutual", category: "Renter's insurance",
    amountCents: 1_850, usualCents: 1_850, dueAt: inDays(12), status: "scheduled", autopay: true, source: "email",
  });
  await ctx.db.insert("bills", {
    ownerId: adi, payee: "Ironleaf Fitness", category: "Gym",
    amountCents: 4_900, usualCents: 4_900, dueAt: ago(2), status: "paid", paidAt: ago(2), autopay: true, source: "email",
    note: "Charged to your card by autopay, outside Plex",
  });

  // ── Subscriptions ─────────────────────────────────────────────────────────
  const sub = (x: Omit<Parameters<typeof ctx.db.insert<"subscriptions">>[1], "ownerId" | "status"> & { status?: "active" | "paused" | "cancelled" }) =>
    ctx.db.insert("subscriptions", { ownerId: adi, status: "active", ...x });
  await sub({ merchant: "Reelhouse", plan: "Standard", amountCents: 1_549, cadence: "monthly", nextChargeAt: inDays(11), lastUsedAt: ago(1, 3), category: "Streaming", paypalSubscriptionId: "SEED-SUB-REELHOUSE" });
  await sub({ merchant: "Tunewell", plan: "Individual", amountCents: 1_099, cadence: "monthly", nextChargeAt: inDays(4), lastUsedAt: ago(0, 2), category: "Music", paypalSubscriptionId: "SEED-SUB-TUNEWELL" });
  await sub({ merchant: "Cloudnest", plan: "200 GB", amountCents: 499, previousAmountCents: 299, cadence: "monthly", nextChargeAt: inDays(6), lastUsedAt: ago(3), category: "Cloud storage", paypalSubscriptionId: "SEED-SUB-CLOUDNEST" });
  await sub({ merchant: "Frame Studio", plan: "Pro", amountCents: 1_499, cadence: "monthly", nextChargeAt: inDays(8), lastUsedAt: ago(74), category: "Design", paypalSubscriptionId: "SEED-SUB-FRAME" });
  await sub({ merchant: "The Daily Tide", plan: "Digital", amountCents: 999, cadence: "monthly", nextChargeAt: inDays(15), lastUsedAt: ago(2), category: "News" });
  await sub({ merchant: "Greenplate", plan: "2 boxes a month", amountCents: 11_980, cadence: "monthly", nextChargeAt: inDays(13), lastUsedAt: ago(6), category: "Meal kit" });
  await sub({ merchant: "Tunnelbird", plan: "VPN, yearly", amountCents: 5_999, cadence: "yearly", nextChargeAt: inDays(142), lastUsedAt: ago(20), category: "VPN" });

  // ── Routines and their runs ───────────────────────────────────────────────
  const activity = (x: Omit<Parameters<typeof ctx.db.insert<"agentActivity">>[1], "ownerId">) =>
    ctx.db.insert("agentActivity", { ownerId: adi, ...x });

  const finishedTitle = { done: "Ran", failed: "Didn't finish", skipped: "Skipped", cancelled: "Stopped" } as const;
  const runs = async (
    routineId: Id<"routines">,
    name: string,
    list: Array<{
      at: number;
      status: "done" | "failed" | "skipped" | "cancelled";
      reason: string;
      steps: StepSeed[];
      summary: string;
      receiptIds?: Id<"receipts">[];
    }>,
  ) => {
    const ids: Id<"routineRuns">[] = [];
    for (const r of list.sort((a, b) => a.at - b.at)) {
      const steps = r.steps.map(([kind, label, detail], i) => ({ at: r.at + i * 20_000, kind, label, detail }));
      const endedAt = r.at + Math.max(1, steps.length) * 20_000;
      const runId = await ctx.db.insert("routineRuns", {
        routineId, ownerId: adi, status: r.status, reason: r.reason, startedAt: r.at, endedAt,
        steps, summary: r.summary, receiptIds: r.receiptIds ?? [],
      });
      ids.push(runId);
      if (r.at > now - 8 * DAY)
        await activity({
          at: endedAt, kind: "routine", title: `${finishedTitle[r.status]} “${name}”`, detail: r.summary,
          runId, routineId, receiptId: r.receiptIds?.[0],
        });
    }
    const last = list[list.length - 1]!;
    await ctx.db.patch(routineId, { lastRunAt: last.at, lastStatus: last.status, lastSummary: last.summary });
    return ids;
  };

  const routine = async (x: {
    name: string; prompt: string; icon: string; trigger: RoutineTrigger;
    conditions: { text: string; check?: string }[];
    steps: { kind: "check" | "act" | "money" | "notify" | "ask" | "wait"; title: string; detail?: string; tool?: string }[];
    guardrails: { potName?: string; maxSpendCents?: number; approval: "always" | "over_limit" | "never_money" };
    summary: string; runWhere: "mac" | "cloud"; missed: "run_on_wake" | "skip"; createdDaysAgo: number;
  }) =>
    ctx.db.insert("routines", {
      ownerId: adi,
      name: x.name,
      prompt: x.prompt,
      icon: x.icon,
      spec: {
        trigger: x.trigger,
        conditions: x.conditions,
        steps: x.steps.map((s, i) => ({ id: `s${i + 1}`, ...s })),
        guardrails: x.guardrails,
        summary: x.summary,
      },
      runWhere: x.runWhere,
      missed: x.missed,
      timezone: MAC_TZ,
      enabled: true,
      nextRunAt: nextRunAt(x.trigger, MAC_TZ, now),
      createdAt: ago(x.createdDaysAgo),
    });

  /** The last `count` scheduled times before now. */
  const pastSlots = (trigger: RoutineTrigger, count: number, spanDays: number) => {
    const out: number[] = [];
    let t = now - spanDays * DAY;
    for (let i = 0; i < 200; i++) {
      const n = nextRunAt(trigger, MAC_TZ, t);
      if (n === undefined || n >= now) break;
      out.push(n);
      t = n;
    }
    return out.slice(-count);
  };

  // 1. Rent, when both roommates have paid (email trigger)
  const rent = await routine({
    name: "Pay rent when everyone's in",
    prompt: "When Maya and Jonah have both paid their share of rent, pay Sam the full $1,850 from Bills.",
    icon: "house",
    trigger: {
      kind: "email",
      query: "from:service@paypal.com subject:(paid invoice rent) newer_than:1d",
      label: "A roommate pays their rent invoice",
    },
    conditions: [
      { text: "Maya and Jonah have both paid this month's rent invoice", check: "Both rent invoices for this month are PAID in PayPal" },
      { text: "This month's rent to Sam isn't paid yet", check: "No receipt to Sam Okafor since the 25th of last month" },
    ],
    steps: [
      { kind: "check", title: "Check both rent invoices", detail: "Maya $620 and Jonah $620, in PayPal", tool: "paypal.invoices" },
      { kind: "check", title: "Make sure rent isn't paid yet", tool: "agentMoney.recent" },
      { kind: "money", title: "Pay Sam Okafor $1,850 from Bills", detail: "This month's rent", tool: "agentMoney.pay" },
      { kind: "notify", title: "Send you the receipt" },
    ],
    guardrails: { potName: "Bills", maxSpendCents: 185_000, approval: "over_limit" },
    summary: "When Maya and Jonah have both paid their rent invoices, pays Sam Okafor $1,850 from Bills and sends you the receipt.",
    runWhere: "cloud",
    missed: "run_on_wake",
    createdDaysAgo: 48,
  });
  await runs(rent, "Pay rent when everyone's in", [
    {
      at: ago(36, 3), status: "done", reason: "Email: Maya Chen paid your invoice",
      steps: [["info", "Email from PayPal: Maya Chen paid $620.00"], ["tool", "Checked both rent invoices", "Maya: paid · Jonah: sent"], ["done", "Done"]],
      summary: "Maya paid her share. Waiting on Jonah before paying rent.",
    },
    {
      at: ago(35, 1), status: "done", reason: "Email: Jonah Brooks paid your invoice", receiptIds: [rentOct],
      steps: [
        ["info", "Email from PayPal: Jonah Brooks paid $620.00"],
        ["tool", "Checked both rent invoices", "Maya: paid · Jonah: paid"],
        ["tool", "No rent receipt to Sam this month"],
        ["money", "Paid Sam Okafor $1,850.00", "Bills: Pay Sam Okafor up to $1,850 without asking"],
        ["done", "Done"],
      ],
      summary: "Jonah paid too. Paid Sam Okafor $1,850 for October's rent.",
    },
    {
      at: ago(6, 5), status: "done", reason: "Email: Jonah Brooks paid your invoice",
      steps: [["info", "Email from PayPal: Jonah Brooks paid $620.00"], ["tool", "Checked both rent invoices", "Maya: sent · Jonah: paid"], ["done", "Done"]],
      summary: "Jonah paid his share. Waiting on Maya before paying rent.",
    },
    {
      at: ago(5, 9), status: "done", reason: "Email: Maya Chen paid your invoice", receiptIds: [rentNov],
      steps: [
        ["info", "Email from PayPal: Maya Chen paid $620.00"],
        ["tool", "Checked both rent invoices", "Maya: paid · Jonah: paid"],
        ["tool", "No rent receipt to Sam this month"],
        ["money", "Paid Sam Okafor $1,850.00", "Bills: Pay Sam Okafor up to $1,850 without asking"],
        ["done", "Done"],
      ],
      summary: "Maya paid too. Paid Sam Okafor $1,850 for November's rent.",
    },
  ]);

  // 2. Friday money check-in (schedule)
  const fridayTrigger: RoutineTrigger = { kind: "schedule", cadence: "weekly", days: [5], time: "18:00" };
  const checkin = await routine({
    name: "Friday money check-in",
    prompt: "Every Friday at 6, tell me how each pot did this week and what bills are coming up.",
    icon: "calendar-check",
    trigger: fridayTrigger,
    conditions: [],
    steps: [
      { kind: "check", title: "Add up each pot's week", tool: "agentMoney.recent" },
      { kind: "check", title: "Find bills due in the next 7 days", tool: "agent.snapshot" },
      { kind: "check", title: "Spot anything unusual", detail: "A pot ahead of pace, a bill above its usual" },
      { kind: "notify", title: "Send you a short summary" },
    ],
    guardrails: { approval: "never_money" },
    summary: "Every Friday at 6 pm, sums up what each pot spent this week, lists the bills due in the next 7 days and sends you a short note.",
    runWhere: "cloud",
    missed: "run_on_wake",
    createdDaysAgo: 40,
  });
  const fridays = pastSlots(fridayTrigger, 3, 22);
  const fridaySummaries = [
    "Spent $296 this week, $70 under your average. No bills due next week.",
    "Spent $388 this week. Food is on pace and Shopping is $60 under. Rent is due on the 1st; Maya and Jonah haven't paid yet.",
    "Spent $412 this week: Food $164, Bills $101, Shopping $84, Errands $63. Due next week: Northwave $84.20 and Pacific Power $212.",
  ].slice(-fridays.length);
  await runs(
    checkin,
    "Friday money check-in",
    fridays.map((at, i) => ({
      at, status: "done" as const, reason: "Scheduled for 6 pm",
      steps: [
        ["info", "Started: Scheduled for 6 pm"],
        ["tool", "Added up the week's receipts"],
        ["tool", "Looked up bills due in the next 7 days"],
        ["info", "Sent you the summary"],
        ["done", "Done"],
      ] as StepSeed[],
      summary: fridaySummaries[i]!,
    })),
  );

  // 3. Utility bill guard (email)
  const utility = await routine({
    name: "Pay utility bills unless they spike",
    prompt: "When a bill from Pacific Power or Northwave comes in, pay it from Bills. If it's more than 20% over the usual, hold it and ask me first.",
    icon: "zap",
    trigger: {
      kind: "email",
      query: "from:(pacificpower OR northwave) subject:(bill OR statement) newer_than:1d",
      label: "A bill email from Pacific Power or Northwave",
    },
    conditions: [{ text: "The amount is within 20% of the usual bill", check: "amount <= usual × 1.2" }],
    steps: [
      { kind: "check", title: "Read the amount and due date from the email", tool: "gmail" },
      { kind: "check", title: "Compare it with the last three bills" },
      { kind: "ask", title: "Ask you first if it's more than 20% over the usual" },
      { kind: "money", title: "Pay it from Bills", tool: "agentMoney.pay" },
    ],
    guardrails: { potName: "Bills", maxSpendCents: 30_000, approval: "over_limit" },
    summary: "When a Pacific Power or Northwave bill arrives, pays it from Bills, and holds it to ask you first if it's more than 20% above the usual.",
    runWhere: "cloud",
    missed: "run_on_wake",
    createdDaysAgo: 45,
  });
  const utilityRuns = await runs(utility, "Pay utility bills unless they spike", [
    {
      at: ago(33, 2), status: "done", reason: "Email from Pacific Power", receiptIds: [powerOct],
      steps: [
        ["info", "Email from Pacific Power: October statement"],
        ["tool", "Read the bill", "$94.10, due in 2 days"],
        ["tool", "Compared with the usual", "$96 usual: 2% under"],
        ["money", "Paid Pacific Power $94.10", "Bills: Up to $3,000 a month"],
        ["done", "Done"],
      ],
      summary: "Pacific Power sent $94.10, close to the usual $96. Paid it from Bills.",
    },
    {
      at: ago(30, 6), status: "done", reason: "Email from Northwave Internet", receiptIds: [netOct],
      steps: [
        ["info", "Email from Northwave Internet: your bill is ready"],
        ["tool", "Read the bill", "$79.00, due in 2 days"],
        ["money", "Paid Northwave Internet $79.00", "Bills: Up to $3,000 a month"],
        ["done", "Done"],
      ],
      summary: "Northwave sent $79.00, as usual. Paid it from Bills.",
    },
    {
      at: ago(1, 4), status: "done", reason: "Email from Pacific Power",
      steps: [
        ["info", "Email from Pacific Power: November statement"],
        ["tool", "Read the bill", "$212.00, due in 6 days"],
        ["tool", "Compared with the usual", "$96 usual: 121% over"],
        ["ask", "Asked you before paying", "Pay Pacific Power $212.00?"],
        ["done", "Done"],
      ],
      summary: "Pacific Power sent $212.00, more than double the usual $96. Asked you before paying.",
    },
  ]);

  // 4. Subscription price watch (schedule, on the Mac for app usage)
  const morningTrigger: RoutineTrigger = { kind: "schedule", cadence: "daily", time: "08:30" };
  const watch = await routine({
    name: "Watch my subscriptions",
    prompt: "Every morning, check my subscriptions. Tell me if a price goes up, and ask before I keep paying for anything I haven't used in two months.",
    icon: "repeat",
    trigger: morningTrigger,
    conditions: [],
    steps: [
      { kind: "check", title: "Look for price-change emails", tool: "gmail" },
      { kind: "check", title: "Check when you last opened each app", tool: "app_usage" },
      { kind: "ask", title: "Ask about anything unused for 60 days" },
      { kind: "notify", title: "Tell you about price changes" },
    ],
    guardrails: { approval: "never_money" },
    summary: "Every morning at 8:30, looks for subscription price increases and asks you about anything you haven't opened in 60 days.",
    runWhere: "mac",
    missed: "skip",
    createdDaysAgo: 21,
  });
  const mornings = pastSlots(morningTrigger, 4, 5);
  const morningRuns = mornings.map((at, i) => {
    const latest = i === mornings.length - 1;
    if (i === mornings.length - 3)
      return {
        at, status: "skipped" as const, reason: "Missed at 8:30 am while your Mac slept",
        steps: [["info", "Missed at 8:30 am while your Mac slept"]] as StepSeed[],
        summary: "Missed at 8:30 am while your Mac slept",
      };
    return latest
      ? {
          at, status: "done" as const, reason: "Scheduled for 8:30 am",
          steps: [
            ["info", "Started: Scheduled for 8:30 am"],
            ["tool", "Searched Gmail for price changes", "1 found: Cloudnest"],
            ["tool", "Checked app usage on your Mac", "Frame Studio: last opened 74 days ago"],
            ["ask", "Asked you about Frame Studio", "Cancel Frame Studio?"],
            ["done", "Done"],
          ] as StepSeed[],
          summary: "Cloudnest went up from $2.99 to $4.99 a month. Frame Studio hasn't been opened in 74 days: asked whether to cancel it.",
        }
      : {
          at, status: "done" as const, reason: "Scheduled for 8:30 am",
          steps: [
            ["info", "Started: Scheduled for 8:30 am"],
            ["tool", "Searched Gmail for price changes", "None"],
            ["tool", "Checked app usage on your Mac"],
            ["done", "Done"],
          ] as StepSeed[],
          summary: "No price changes and nothing new to flag.",
        };
  });
  const watchRuns = await runs(watch, "Watch my subscriptions", morningRuns);

  // 5. Pass the contractor her share (PayPal event)
  const lena = await routine({
    name: "Pass Lena her share",
    prompt: "When a client pays one of my illustration invoices, send Lena her 30%.",
    icon: "split",
    trigger: { kind: "paypal", event: "INVOICING.INVOICE.PAID", label: "A client pays one of your invoices" },
    conditions: [{ text: "The invoice is for an illustration project Lena worked on", check: "Invoice items or note mention illustration" }],
    steps: [
      { kind: "check", title: "Read the paid invoice", tool: "paypal.invoice" },
      { kind: "check", title: "Confirm Lena worked on it" },
      { kind: "money", title: "Send Lena 30% from Work", tool: "agentMoney.pay" },
      { kind: "notify", title: "Tell you it's sent" },
    ],
    guardrails: { potName: "Work", maxSpendCents: 100_000, approval: "over_limit" },
    summary: "When a client pays one of your illustration invoices, sends Lena Varga her 30% from Work.",
    runWhere: "cloud",
    missed: "run_on_wake",
    createdDaysAgo: 30,
  });
  await runs(lena, "Pass Lena her share", [
    {
      at: ago(17, 3), status: "done", reason: "PayPal: A client pays one of your invoices", receiptIds: [lenaOct],
      steps: [
        ["info", "PayPal sent INVOICING.INVOICE.PAID"],
        ["tool", "Read the invoice", "Halcyon Books, cover illustrations, $1,200.00"],
        ["money", "Sent Lena Varga $360.00", "Work: Up to $3,000 a month"],
        ["done", "Done"],
      ],
      summary: "Halcyon Books paid $1,200 for the cover illustrations. Sent Lena $360 (30%).",
    },
    {
      at: ago(3, 6), status: "done", reason: "PayPal: A client pays one of your invoices", receiptIds: [lenaNov],
      steps: [
        ["info", "PayPal sent INVOICING.INVOICE.PAID"],
        ["tool", "Read the invoice", "Moss & Pine Coffee, menu illustrations, $1,800.00"],
        ["money", "Sent Lena Varga $540.00", "Work: Up to $3,000 a month"],
        ["done", "Done"],
      ],
      summary: "Moss & Pine Coffee paid $1,800 for the menu illustrations. Sent Lena $540 (30%).",
    },
  ]);

  // ── Needs you: one money approval, one question ──────────────────────────
  const powerAt = ago(1, 4) + 3 * 20_000;
  const approvalId = await ctx.db.insert("approvals", {
    ownerId: adi,
    potId: bills,
    agentLabel: MAC,
    description: "Pacific Power's November bill: $212.00, more than double the usual $96",
    merchant: "Pacific Power",
    amountCents: 21_200,
    ruleText: "Ask before anything over $100",
    status: "pending",
  });
  await ctx.db.insert("asks", {
    ownerId: adi,
    kind: "approval",
    title: "Pay Pacific Power $212.00?",
    detail: "November's bill is more than double your usual $96, most likely heating since the cold snap. Due in 5 days.",
    amountCents: 21_200,
    payee: "Pacific Power",
    ruleText: "Ask before anything over $100",
    potName: "Bills",
    approvalId,
    source: { kind: "routine", label: "Pay utility bills unless they spike", runId: utilityRuns.at(-1) },
    status: "pending",
    createdAt: powerAt,
  });
  const lastMorning = mornings.at(-1) ?? ago(0, 2);
  const frameAt = lastMorning + 3 * 20_000;
  await ctx.db.insert("asks", {
    ownerId: adi,
    kind: "question",
    title: "Cancel Frame Studio?",
    detail: "You haven't opened it in 74 days. It's $14.99 a month, and the next charge is in 8 days.",
    options: ["Cancel it", "Keep it", "Ask me next month"],
    source: { kind: "routine", label: "Watch my subscriptions", runId: watchRuns.at(-1) },
    status: "pending",
    createdAt: frameAt,
  });

  // ── Memory ────────────────────────────────────────────────────────────────
  const mem = (
    kind: "fact" | "preference" | "person" | "merchant" | "habit" | "note",
    text: string,
    x: { about?: string; source?: "said" | "learned" | "email" | "routine" | "settings"; pinned?: boolean; uses?: number; daysAgo?: number; confidence?: number } = {},
  ) =>
    ctx.db.insert("memories", {
      ownerId: adi,
      kind,
      text,
      about: x.about,
      source: x.source ?? "said",
      confidence: x.confidence ?? 0.95,
      pinned: x.pinned ?? false,
      uses: x.uses ?? 0,
      lastUsedAt: x.uses ? ago(Math.min(x.daysAgo ?? 3, 2), 3) : undefined,
      embedding: [],
      archived: false,
      createdAt: ago(x.daysAgo ?? 10),
      updatedAt: ago(x.daysAgo ?? 10),
    });
  await mem("person", "Sam Okafor is the landlord. Rent is $1,850, due on the 1st.", { about: "Sam Okafor", pinned: true, uses: 9, daysAgo: 48 });
  await mem("person", "Maya Chen is a roommate and pays $620 of the rent. Her PayPal email is maya.chen@example.com.", { about: "Maya Chen", uses: 7, daysAgo: 48 });
  await mem("person", "Jonah Brooks is a roommate and pays $620 of the rent. His PayPal email is jonah.brooks@example.com.", { about: "Jonah Brooks", uses: 7, daysAgo: 48 });
  await mem("person", "Lena Varga is a freelance illustrator who works with Adi. She gets 30% of every client invoice she worked on. lena.varga@example.com", { about: "Lena Varga", pinned: true, uses: 4, daysAgo: 30 });
  await mem("preference", "Prefers to approve anything over $100.", { pinned: true, uses: 12, daysAgo: 52 });
  await mem("preference", "Wants bills paid two days before they're due, not on the day.", { uses: 5, daysAgo: 1 });
  await mem("preference", "Doesn't want to keep paying for a subscription unused for more than 60 days.", { uses: 2, daysAgo: 21 });
  await mem("fact", "Keeps checking at Bayview Credit Union; PayPal is linked to it.", { source: "settings", uses: 1, daysAgo: 52 });
  await mem("fact", "Lives in the Mission, San Francisco (Pacific time).", { source: "settings", uses: 3, daysAgo: 52 });
  await mem("merchant", "Northwave Internet is usually $79 a month; the 12-month promo price ended in November.", { about: "Northwave Internet", source: "email", uses: 3, daysAgo: 2, confidence: 0.9 });
  await mem("merchant", "Pacific Power bills run about $96 a month; winter bills run higher.", { about: "Pacific Power", source: "learned", uses: 4, daysAgo: 33, confidence: 0.85 });
  await mem("habit", "Orders lunch from Juniper Noodle Bar most weekdays, usually about $14.", { about: "Juniper Noodle Bar", source: "learned", uses: 6, daysAgo: 12, confidence: 0.8 });
  await mem("habit", "Sends 10% of what Plex saves to Lakeside Commons.", { about: "Lakeside Commons", source: "settings", uses: 2, daysAgo: 40 });
  await mem("note", "Frame Studio was for a one-off poster project in August.", { about: "Frame Studio", source: "learned", uses: 1, daysAgo: 74, confidence: 0.7 });
  // Where the demo world's businesses live online (apps/web /sites/*, served on their own *.localhost hosts).
  await mem("merchant", "Clay Commons is the pottery studio Adi wants to try; it books classes at http://claycommons.localhost:3000.", { about: "Clay Commons", source: "said", uses: 1, daysAgo: 9 });
  await mem("merchant", "Brightline Mobile never emails a bill; the balance is on the account page at http://brightline.localhost:3000.", { about: "Brightline Mobile", source: "learned", uses: 2, daysAgo: 35, confidence: 0.9 });
  await mem("merchant", "Cloudnest's plans are changed on its site, http://cloudnest.localhost:3000, not through PayPal.", { about: "Cloudnest", source: "learned", uses: 1, daysAgo: 20, confidence: 0.85 });
  await mem("merchant", "City of Lakeport parking citations are paid at http://lakeport.localhost:3000.", { about: "City of Lakeport", source: "learned", uses: 1, daysAgo: 120, confidence: 0.8 });
  await mem("person", "Adi's full name is Adi Reddy; email for bookings and receipts: adi.reddy@plexmail.example.com.", { about: "Adi", source: "settings", pinned: true, uses: 4, daysAgo: 60 });
  await mem("fact", "Adi's car is a Honda Civic, plate 8KDN042 (California).", { about: "car", source: "said", uses: 1, daysAgo: 60 });

  // ── The rest of the week on Today ─────────────────────────────────────────
  const feed: Array<Omit<Parameters<typeof activity>[0], "at"> & { at: number }> = [
    { at: powerAt, kind: "handoff", title: "Plex needs you: Pay Pacific Power $212.00?", detail: "Ask before anything over $100" },
    { at: frameAt, kind: "handoff", title: "Plex needs you: Cancel Frame Studio?", detail: "Unused for 74 days, $14.99 a month" },
    { at: ago(5, 9) + 80_000, kind: "money", title: "Paid Sam Okafor $1,850", detail: rentWhy, receiptId: rentNov },
    { at: ago(3, 6) + 40_000, kind: "money", title: "Paid Lena Varga $540", detail: lenaWhy, receiptId: lenaNov },
    { at: ago(0, 3), kind: "voice", title: "You asked how much is left in Food", detail: "$214.50 left this month; $13 spent today" },
    { at: ago(1, 6), kind: "memory", title: "Remembered", detail: "Wants bills paid two days before they're due, not on the day." },
    { at: ago(1, 5) + 20 * MIN, kind: "money", title: "Requested $139.80 for dinner from Maya, Jonah and Priya", detail: "Split last night's dinner with the people in that chat" },
    { at: ago(2, 1), kind: "system", title: "Ironleaf Fitness charged $49.00 by autopay", detail: "On your card, outside Plex. Matches the usual." },
    { at: ago(2, 4), kind: "task", title: "Checked Northwave's plans", detail: "No cheaper plan at your speed. The $5.20 rise is the promo ending." },
    { at: ago(2, 8), kind: "voice", title: "You asked Plex to nudge Priya about dinner", detail: "PayPal sent Priya a reminder for $45.80" },
    { at: ago(3, 2), kind: "handoff", title: "You did it: Sign in to Northwave in the Plex browser", detail: "Plex keeps the session in its own browser profile" },
    { at: ago(3, 8), kind: "system", title: "Plex for Mac connected", detail: "Accessibility and Calendar access granted" },
    { at: ago(4, 2), kind: "memory", title: "Remembered", detail: "Lena Varga gets 30% of every client invoice she worked on." },
    { at: ago(5, 6), kind: "task", title: "Added the Brightline Mobile bill", detail: "$62.14, read off Brightline's account page" },
    { at: ago(6, 4), kind: "task", title: "Saved your Pacific Power statements", detail: "12 PDFs in Documents/Bills" },
  ];
  for (const f of feed) await activity(f);
}
