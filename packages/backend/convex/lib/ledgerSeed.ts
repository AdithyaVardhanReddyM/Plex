import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { writeReceipt, type ReceiptInput } from "./receipts";
import { userByHandle } from "./viewer";

/**
 * History the Ledger needs to tell a story: three weeks of finished tasks
 * (proofs that passed, two that failed in Dogpatch, one dispute), a couple of
 * MCP-agent purchases, and the cause's donations and paid cleanup shifts.
 * All invented, all sandbox. Called at the end of `seed:run`; idempotent.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Step = { daysAgo: number; hoursAgo?: number; label: string; state: Doc<"receipts">["state"] };

export async function seedLedgerHistory(ctx: MutationCtx) {
  const marker = await ctx.db
    .query("tasks")
    .withIndex("by_status", (q) => q.eq("status", "disputed"))
    .first();
  if (marker?.tags.includes("ledger-history")) return "Ledger history already seeded.";

  const h = async (handle: string) => {
    const u = await userByHandle(ctx, handle);
    if (!u) throw new Error(`Seed user ${handle} missing: run seed:run first`);
    return u;
  };
  const [adi, rosa, luis, theo, amara, kenji, lakeside, fernway] = await Promise.all(
    ["adi", "rosa", "luis", "theo", "amara", "kenji", "lakeside-commons", "fernway"].map(h),
  );
  const pots = await ctx.db.query("pots").withIndex("by_owner", (q) => q.eq("ownerId", adi._id)).collect();
  const pot = (name: string) => pots.find((p) => p.name === name)?._id;
  const cause = await ctx.db
    .query("causes")
    .withIndex("by_slug", (q) => q.eq("slug", "lake-merritt-shoreline"))
    .unique();

  // On the hour, so past shifts read "9am–1pm", not "9:39am–1:39pm".
  const now = Math.floor(Date.now() / HOUR) * HOUR;
  const ago = (days: number, hours = 0) => now - days * DAY - hours * HOUR;

  /** A receipt with a backdated, multi-step timeline. */
  const receipt = async (input: ReceiptInput, steps: Step[]) => {
    const last = steps[steps.length - 1]!;
    const id = await writeReceipt(ctx, { ...input, state: last.state, occurredAt: ago(steps[0]!.daysAgo, steps[0]!.hoursAgo) });
    await ctx.db.patch(id, {
      timeline: steps.map((s) => ({ at: ago(s.daysAgo, s.hoursAgo), label: s.label, state: s.state })),
    });
    return id;
  };

  // ── Adi's finished tasks ─────────────────────────────────────────────────
  type Past = {
    title: string;
    brief: string;
    worker: Doc<"users">;
    cents: number;
    daysAgo: number;
    area: { label: string; lat: number; lng: number };
    category: "local" | "remote" | "data";
    via: "web" | "mac" | "mcp";
    spec: string[];
    outcome: "pass" | "fail" | "disputed";
    confidence: number;
    summary: string;
    failed?: { check: string; detail: string };
    tags: string[];
  };
  const past: Past[] = [
    {
      title: "Photograph the stalls at the Heart of the City market",
      brief: "Show me which stalls at the Wednesday market sell sourdough, with prices.",
      worker: rosa, cents: 3_000, daysAgo: 16, category: "local", via: "mac",
      area: { label: "UN Plaza, SF", lat: 37.7799, lng: -122.4142 },
      spec: ["Stall overview", "Bread prices", "Market sign"],
      outcome: "pass", confidence: 0.97,
      summary: "Six stalls photographed with prices legible, taken during market hours at UN Plaza.",
      tags: ["Photos", "Market"],
    },
    {
      title: "Hold a place in line for the Saturday bread drop",
      brief: "Someone wait in line at Arizmendi from 8 and text me when it's my turn.",
      worker: luis, cents: 2_500, daysAgo: 13, category: "local", via: "mac",
      area: { label: "Arizmendi, Valencia St", lat: 37.7562, lng: -122.4211 },
      spec: ["Line at 8am", "Front of line"],
      outcome: "pass", confidence: 0.91,
      summary: "Two timestamped photos 41 minutes apart at the bakery's door.",
      tags: ["Errand", "Line"],
    },
    {
      title: "Rate 120 support replies for clarity",
      brief: "Score my support bot's replies 1–5 for clarity and flag anything wrong.",
      worker: amara, cents: 3_600, daysAgo: 11, category: "data", via: "mcp",
      area: { label: "Remote", lat: 6.5244, lng: 3.3792 },
      spec: ["Completed sheet"],
      outcome: "pass", confidence: 0.99,
      summary: "All 120 rows scored; spot-check of 12 rows matches the rubric.",
      tags: ["Remote", "Data"],
    },
    {
      title: "Try our signup flow with VoiceOver",
      brief: "Can a screen-reader user sign up for the beta without help?",
      worker: theo, cents: 4_000, daysAgo: 8, category: "remote", via: "web",
      area: { label: "Remote", lat: 37.8044, lng: -122.2712 },
      spec: ["Screen recording", "Notes"],
      outcome: "pass", confidence: 0.94,
      summary: "Full recording with VoiceOver audio; two unlabeled buttons noted with timestamps.",
      tags: ["Remote", "Accessibility"],
    },
    {
      title: "Return a package at the UPS store on Mission",
      brief: "Drop my return at the UPS store before it closes and send the receipt.",
      worker: rosa, cents: 1_500, daysAgo: 3, category: "local", via: "mac",
      area: { label: "UPS Store, Mission St", lat: 37.7609, lng: -122.4194 },
      spec: ["Drop-off receipt"],
      outcome: "pass", confidence: 0.98,
      summary: "Drop-off receipt photographed at the counter, tracking number readable.",
      tags: ["Errand"],
    },
    {
      title: "Photograph the parking signs on 3rd St, Dogpatch",
      brief: "What are the parking rules on 3rd between 20th and 22nd?",
      worker: luis, cents: 2_000, daysAgo: 2, category: "local", via: "mac",
      area: { label: "3rd St, Dogpatch", lat: 37.7605, lng: -122.3884 },
      spec: ["North block signs", "South block signs"],
      outcome: "fail", confidence: 0.88,
      summary: "Photos were taken on Illinois St, about 300 m from the marked blocks.",
      failed: { check: "At the location", detail: "Taken ~300 m away, on Illinois St" },
      tags: ["Photos", "Dogpatch"],
    },
    {
      title: "Check day-pass prices at a Dogpatch co-working space",
      brief: "Find out what a day pass costs at the co-working space on 22nd.",
      worker: theo, cents: 2_800, daysAgo: 1, category: "local", via: "mcp",
      area: { label: "22nd St, Dogpatch", lat: 37.7577, lng: -122.3889 },
      spec: ["Price board", "Entrance"],
      outcome: "disputed", confidence: 0.58,
      summary: "The price board photo is blurry and the challenge word isn't visible. Theo contested.",
      failed: { check: "Challenge word", detail: "Not visible in any photo" },
      tags: ["Dogpatch", "Prices"],
    },
  ];

  for (const p of past) {
    const potId = pot("Errands");
    const start = p.daysAgo;
    const status: Doc<"tasks">["status"] = p.outcome === "pass" ? "paid" : p.outcome === "fail" ? "refunded" : "disputed";
    const taskId = await ctx.db.insert("tasks", {
      posterId: adi._id,
      postedVia: p.via,
      agentLabel: p.via === "mac" ? "Plex for Mac" : p.via === "mcp" ? "Claude (MCP)" : undefined,
      title: p.title,
      brief: p.brief,
      description: p.brief,
      category: p.category,
      location: p.area.label === "Remote" ? undefined : { ...p.area, radiusM: 200 },
      windowStart: ago(start, 6),
      windowEnd: ago(start, 1),
      payout: { kind: "fixed", amountCents: p.cents },
      currency: "USD",
      proofSpec: p.spec.map((label) => ({ label, description: label, type: "photo" as const })),
      verificationMode: "one_tap",
      challengeCode: "harbor-" + (10 + p.cents / 100),
      status,
      funding: {
        state: p.outcome === "pass" ? "released" : p.outcome === "fail" ? "refunded" : "captured",
        orderId: `SEED-LEDGER-ORD-${p.daysAgo}`,
        captureId: `SEED-LEDGER-CAP-${p.daysAgo}`,
      },
      assigneeId: p.worker._id,
      tags: [...p.tags, "ledger-history"],
    });
    const checks = [
      ...p.spec.map((label) => ({ check: label, passed: true, detail: "Present and legible" })),
      { check: "Taken in the window", passed: true, detail: "Inside the task window" },
      ...(p.failed ? [{ ...p.failed, passed: false }] : [{ check: "At the location", passed: true, detail: "Within the marked area" }]),
    ];
    const verdictResult = p.outcome === "pass" ? "pass" : p.outcome === "fail" ? "fail" : "unsure";
    const proofId = await ctx.db.insert("proofs", {
      taskId,
      workerId: p.worker._id,
      items: p.spec.map((_, i) => ({ specIndex: i, capturedAt: ago(start, 3 - i * 0.5), lat: p.area.lat, lng: p.area.lng })),
      status: verdictResult,
      verdict: { result: verdictResult, confidence: p.confidence, summary: p.summary, checks, model: "gemini-2.5-flash" },
      decision: p.outcome === "pass" ? "approved" : p.outcome === "fail" ? "rejected" : "contested",
    });
    const passed = checks.filter((c) => c.passed).length;
    const verdict = `${verdictResult === "pass" ? "Pass" : verdictResult === "fail" ? "Fail" : "Unsure"} · ${Math.round(p.confidence * 100)}% · ${passed} of ${checks.length} checks`;
    const base = {
      currency: "USD",
      ownerId: adi._id,
      category: "Errands",
      potId,
      taskId,
      why: p.brief,
      agentLabel: p.via === "mac" ? "Plex for Mac" : p.via === "mcp" ? "Claude (MCP)" : undefined,
    };
    await receipt(
      {
        ...base,
        kind: "task_funding",
        amountCents: p.cents,
        payerId: adi._id,
        payerLabel: adi.name,
        payeeLabel: "Plex (held)",
        rule: { source: "policy", text: "Errands: up to $50 per task, pay only on proof" },
        evidence: { proofId, verdict, checks },
        state: "held",
        paypal: { orderId: `SEED-LEDGER-ORD-${p.daysAgo}`, captureId: `SEED-LEDGER-CAP-${p.daysAgo}` },
      },
      [
        { daysAgo: start, hoursAgo: 8, label: "Funded through PayPal", state: "funded" },
        { daysAgo: start, hoursAgo: 7.9, label: "Held by Plex until proof passes", state: "held" },
        ...(p.outcome === "pass"
          ? [{ daysAgo: start, hoursAgo: 1, label: `Proof passed · released to ${p.worker.name.split(" ")[0]}`, state: "released" as const }]
          : p.outcome === "fail"
            ? [{ daysAgo: start, hoursAgo: 1, label: "Proof failed · refunded to you", state: "refunded" as const }]
            : [{ daysAgo: start, hoursAgo: 1, label: `${p.worker.name.split(" ")[0]} contested the verdict`, state: "disputed" as const }]),
      ],
    );
    if (p.outcome === "pass") {
      await receipt(
        {
          ...base,
          kind: "payout",
          amountCents: p.cents,
          payerLabel: "Plex",
          payeeId: p.worker._id,
          payeeLabel: p.worker.name,
          rule: { source: "proof", text: "Proof passed · you approved with one tap" },
          evidence: { proofId, verdict, checks },
          state: "released",
          paypal: { payoutBatchId: `SEED-LEDGER-BATCH-${p.daysAgo}` },
        },
        [{ daysAgo: start, hoursAgo: 1, label: "Paid out through PayPal Payouts", state: "released" }],
      );
    } else if (p.outcome === "fail") {
      await receipt(
        {
          ...base,
          kind: "refund",
          amountCents: p.cents,
          payerLabel: "Plex",
          payeeId: adi._id,
          payeeLabel: adi.name,
          rule: { source: "proof", text: "Proof failed: “At the location”" },
          evidence: { proofId, verdict, checks },
          state: "refunded",
          paypal: { refundId: `SEED-LEDGER-REF-${p.daysAgo}` },
        },
        [{ daysAgo: start, hoursAgo: 0.5, label: "Refunded through PayPal", state: "refunded" }],
      );
    }
  }

  // A task cancelled after a no-show: a second refund this week.
  await receipt(
    {
      kind: "refund", amountCents: 1_800, currency: "USD", ownerId: adi._id, payerLabel: "Plex", payeeId: adi._id,
      payeeLabel: adi.name, category: "Errands", potId: pot("Errands"), agentLabel: "Plex for Mac",
      why: "Drop my spare keys with the dog walker in Noe Valley (cancelled: no one showed)",
      rule: { source: "system", text: "Nobody started within the window, so the hold was refunded" },
      state: "refunded", paypal: { refundId: "SEED-LEDGER-REF-NOE" },
    },
    [
      { daysAgo: 4, hoursAgo: 9, label: "Held by Plex until proof passes", state: "held" },
      { daysAgo: 4, hoursAgo: 1, label: "Window closed with no taker · refunded", state: "refunded" },
    ],
  );

  // ── MCP agent purchases, one of them unusual ─────────────────────────────
  const mcp = "Claude (MCP)";
  for (const [d, cents, payee, why] of [
    [9, 960, "Lambda Cloud", "Buy 2 GPU hours for tonight's eval run"],
    [5, 1_200, "Typeface Co.", "License the font for the beta site"],
  ] as const) {
    await receipt(
      {
        kind: "purchase", amountCents: cents, currency: "USD", ownerId: adi._id, payerId: adi._id, payerLabel: adi.name,
        payeeLabel: payee, agentLabel: mcp, why, category: "Shopping", potId: pot("Shopping"),
        rule: { source: "policy", text: "Shopping: up to $120 per purchase, ask over $50" }, state: "paid",
      },
      [{ daysAgo: d, hoursAgo: 4, label: "Paid", state: "paid" }],
    );
  }
  await receipt(
    {
      kind: "purchase", amountCents: 11_200, currency: "USD", ownerId: adi._id, payerId: adi._id, payerLabel: adi.name,
      payeeLabel: "Northside Audio", agentLabel: mcp, why: "Noise-cancelling headphones for the office, open-box is fine",
      category: "Shopping", potId: pot("Shopping"),
      rule: { source: "approval", text: "You approved it: “Ask before anything over $50”" },
      evidence: { savedCents: 3_700 },
      state: "paid", paypal: { orderId: "SEED-LEDGER-NSA", captureId: "SEED-LEDGER-NSA-CAP" },
    },
    [
      { daysAgo: 0, hoursAgo: 20, label: "Asked you: over $50", state: "pending" },
      { daysAgo: 0, hoursAgo: 19, label: "You approved · paid", state: "paid" },
    ],
  );

  // ── The cause: donations with receipts, paid cleanup shifts ──────────────
  if (cause) {
    const donated = await ctx.db.query("donations").withIndex("by_cause", (q) => q.eq("causeId", cause._id)).collect();
    // Seeded donations had no receipt; give each one a backdated receipt.
    let i = 0;
    for (const d of donated) {
      if (d.receiptId) continue;
      const day = [1, 3, 5, 8, 10, 12, 15, 18][i % 8]!;
      i++;
      const rid = await receipt(
        {
          kind: "donation", amountCents: d.amountCents, currency: "USD", ownerId: lakeside._id, payerId: d.donorId,
          payerLabel: d.donorLabel, payeeId: lakeside._id, payeeLabel: lakeside.name, causeId: cause._id,
          taskId: d.taskId, category: "Giving",
          why: d.taskId ? "Fund a Saturday cleanup shift" : d.recurring ? "Monthly gift to the shoreline" : "For the shoreline cleanups",
          rule: { source: "donor", text: d.taskId ? "Donor chose a specific shift" : "Goes to the next unfunded shift" },
          state: d.taskId ? "held" : "paid",
        },
        [{ daysAgo: day, hoursAgo: 5 + (i % 7), label: d.taskId ? "Held until the shift's proof passes" : "Received", state: d.taskId ? "held" : "paid" }],
      );
      await ctx.db.patch(d._id, { receiptId: rid });
    }
    const more: Array<[string, number, number, boolean, "direct" | "saved_for_good" | "campaign"]> = [
      ["Noor A.", 5_000, 0, false, "direct"],
      ["Fernway match", 9_600, 2, false, "campaign"],
      ["Tomás R.", 1_500, 2, true, "direct"],
      ["Leah M.", 4_500, 4, false, "direct"],
      ["Anonymous", 2_000, 6, false, "saved_for_good"],
      ["Grace L.", 13_500, 7, false, "direct"],
      ["Sam K.", 4_500, 9, true, "direct"],
      ["Fernway match", 6_200, 11, false, "campaign"],
      ["Ravi P.", 3_000, 14, false, "direct"],
      ["Hana W.", 4_500, 17, true, "direct"],
      ["Owen D.", 1_000, 19, false, "saved_for_good"],
    ];
    for (const [label, cents, day, recurring, source] of more) {
      const rid = await receipt(
        {
          kind: "donation", amountCents: cents, currency: "USD", ownerId: lakeside._id,
          payerId: source === "campaign" ? fernway._id : undefined, payerLabel: label, payeeId: lakeside._id,
          payeeLabel: lakeside.name, causeId: cause._id, category: "Giving",
          agentLabel: source === "saved_for_good" ? "Plex for Mac" : undefined,
          why: source === "campaign" ? "Fernway matches every verified view on “Tell the lake's story”"
            : source === "saved_for_good" ? "10% of what my agent saved this week"
            : recurring ? "Monthly gift to the shoreline" : "For the shoreline cleanups",
          rule: { source: source === "campaign" ? "poster" : "donor", text: source === "campaign" ? "Campaign rule: matched per 1,000 verified views" : "Goes to the next unfunded shift" },
          state: "paid",
        },
        [{ daysAgo: day, hoursAgo: 3 + (cents % 5), label: "Received", state: "paid" }],
      );
      await ctx.db.insert("donations", {
        causeId: cause._id, donorLabel: label, amountCents: cents, recurring, source,
        donorId: source === "campaign" ? fernway._id : undefined, receiptId: rid,
      });
    }

    const shifts: Array<[string, number, Doc<"users">[], number]> = [
      ["Cleanup, north shore", 15, [rosa, luis], 0.96],
      ["Cleanup, boathouse to Pergola", 10, [rosa, luis, kenji], 0.93],
      ["Storm-drain clearing after the rain", 5, [luis, kenji], 0.9],
    ];
    for (const [title, day, workers, conf] of shifts) {
      const taskId = await ctx.db.insert("tasks", {
        posterId: lakeside._id, postedVia: "web", title, brief: title,
        description: "Three hours clearing litter along the marked stretch. Before and after photos at the marked post.",
        category: "impact", location: { label: "Lake Merritt, Oakland", lat: 37.8024, lng: -122.2589, radiusM: 400 },
        windowStart: ago(day, 6), windowEnd: ago(day, 2), payout: { kind: "fixed", amountCents: 4_500 }, currency: "USD",
        proofSpec: [
          { label: "Before", description: "The marked stretch before you start", type: "photo" },
          { label: "After", description: "The same spot, after the shift", type: "photo" },
          { label: "Bags", description: "The filled bags at the pickup point", type: "photo" },
        ],
        verificationMode: "auto", challengeCode: "meadow-" + day, status: "paid",
        funding: { state: "released", orderId: `SEED-LEDGER-SHIFT-${day}` },
        causeId: cause._id, spots: workers.length, tags: ["Impact", "ledger-history"],
      });
      for (const w of workers) {
        const proofId = await ctx.db.insert("proofs", {
          taskId, workerId: w._id,
          items: [0, 1, 2].map((s) => ({ specIndex: s, capturedAt: ago(day, 5 - s * 1.5), lat: 37.8024, lng: -122.2589 })),
          status: "pass",
          verdict: {
            result: "pass", confidence: conf, model: "gemini-2.5-flash",
            summary: "Before and after match the marked post; bags visible at the pickup point.",
            checks: [
              { check: "Before and after", passed: true, detail: "Same angle, same post" },
              { check: "Bags", passed: true, detail: "Filled bags at the pickup point" },
              { check: "Challenge word", passed: true, detail: "On paper in the after photo" },
            ],
          },
          decision: "approved",
        });
        await receipt(
          {
            kind: "payout", amountCents: 4_500, currency: "USD", ownerId: lakeside._id, payerId: lakeside._id,
            payerLabel: lakeside.name, payeeId: w._id, payeeLabel: w.name, causeId: cause._id, taskId, category: "Giving",
            why: `${title}: one 3-hour shift`,
            rule: { source: "proof", text: "Auto-released: proof passed with high confidence" },
            evidence: { proofId, verdict: `Pass · ${Math.round(conf * 100)}% · 3 of 3 checks` },
            state: "released", paypal: { payoutBatchId: `SEED-LEDGER-SHIFT-${day}` },
          },
          [{ daysAgo: day, hoursAgo: 1.5, label: "Paid out through PayPal Payouts", state: "released" }],
        );
      }
    }
  }

  return `Ledger history: ${past.length} finished tasks, MCP purchases, cause donations and shifts.`;
}

