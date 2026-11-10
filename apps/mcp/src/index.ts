#!/usr/bin/env node
/**
 * Plex for Claude: an MCP server over the Plex agent API.
 *
 * Every tool is a thin call to /api/v1 with the key in PLEX_API_KEY. Limits,
 * holds and payouts are decided by Plex (the owner's auto-pay limits in code,
 * PayPal for money), never by this server or the model calling it.
 *
 *   PLEX_API_URL  e.g. http://127.0.0.1:3211 or https://<deployment>.convex.site
 *   PLEX_API_KEY  plx_live_… from /developers in the Plex web app
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.PLEX_API_URL ?? "http://127.0.0.1:3211").replace(/\/$/, "").replace(/\/api\/v1$/, "");
const KEY = process.env.PLEX_API_KEY ?? "";

async function plex(method: "GET" | "POST", path: string, body?: unknown) {
  if (!KEY) return { error: "Set PLEX_API_KEY (create one at /developers in Plex)." };
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "x-api-key": KEY, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: `Plex answered ${res.status}: ${text.slice(0, 200)}` };
  }
}

const reply = (data: unknown) => {
  const isError = typeof data === "object" && data !== null && "error" in data;
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], isError };
};

const server = new McpServer({ name: "plex", version: "0.1.0" });

server.registerTool(
  "plex_whoami",
  { description: "Which Plex agent this key is, who owns it, and whether its owner has paused agents." },
  async () => reply(await plex("GET", "/me")),
);

server.registerTool(
  "plex_list_open_tasks",
  {
    description: "Open tasks on Plex with what to deliver and what each pays. who=agent lists tasks AI agents may take.",
    inputSchema: { who: z.enum(["human", "agent"]).optional() },
  },
  async ({ who }) => reply(await plex("GET", `/tasks${who ? `?who=${who}` : ""}`)),
);

server.registerTool(
  "plex_post_task",
  {
    description:
      "Post a task for a person (real-world work, photo proof) or an AI agent (digital work: text, files, links). Plex's Task Writer writes the task card. It is a draft until funded.",
    inputSchema: {
      brief: z.string().min(8).describe("What needs doing, in a sentence or two, like texting a friend"),
      payoutCents: z.number().int().positive().optional().describe("What it pays, in US cents. Omit to let the Task Writer suggest a fair price."),
      workerType: z.enum(["human", "agent", "either"]).optional(),
    },
  },
  async (args) => reply(await plex("POST", "/tasks", args)),
);

server.registerTool(
  "plex_fund_task",
  {
    description:
      "Hold the payout through PayPal (Orders v2, AUTHORIZE). If the owner turned on auto-pay (a PayPal wallet saved with PayPal Vault) and the amount is inside their limits, it's held at once: state is 'authorized' and agents start bidding. Otherwise returns approveUrl: give it to the user to approve once in PayPal. Nobody is charged until the proof passes.",
    inputSchema: { taskId: z.string() },
  },
  async ({ taskId }) => reply(await plex("POST", `/tasks/${taskId}/fund`, {})),
);

server.registerTool(
  "plex_task_status",
  {
    description: "A task's status, bids (with each round), proof verdict, proofer scorecards and receipts with PayPal ids.",
    inputSchema: { taskId: z.string() },
  },
  async ({ taskId }) => reply(await plex("GET", `/tasks/${taskId}`)),
);

server.registerTool(
  "plex_accept_bid",
  {
    description: "Accept a bid or application. Without applicationId, accepts the best Match. The money stays held.",
    inputSchema: { taskId: z.string(), applicationId: z.string().optional() },
  },
  async ({ taskId, applicationId }) => reply(await plex("POST", `/tasks/${taskId}/accept`, { applicationId })),
);

server.registerTool(
  "plex_approve_and_pay",
  {
    description:
      "Approve the proof: Plex captures the held money and pays the worker through PayPal Payouts. Check plex_task_status first; only approve when the verdict passed or the user said so.",
    inputSchema: { taskId: z.string() },
  },
  async ({ taskId }) => reply(await plex("POST", `/tasks/${taskId}/approve`, {})),
);

server.registerTool(
  "plex_apply",
  {
    description: "Worker keys: bid on a digital task. askCents can't exceed what the poster holds.",
    inputSchema: { taskId: z.string(), askCents: z.number().int().positive(), message: z.string() },
  },
  async ({ taskId, ...body }) => reply(await plex("POST", `/tasks/${taskId}/apply`, body)),
);

server.registerTool(
  "plex_deliver",
  {
    description:
      "Worker keys: deliver the work for an assigned task, one item per spec index (text, or url for link items). Three blind proofer agents score it before PayPal pays.",
    inputSchema: {
      taskId: z.string(),
      items: z.array(z.object({ index: z.number().int(), text: z.string().optional(), url: z.string().url().optional() })),
      note: z.string().optional(),
    },
  },
  async ({ taskId, ...body }) => reply(await plex("POST", `/tasks/${taskId}/deliver`, body)),
);

server.registerTool(
  "plex_plan_crew",
  {
    description:
      "Get a whole goal done by a team of AI agents. Plex's planner splits the goal into steps, gives each to the agent that fits (building a new agent when none does), and connects them so later steps get earlier work. Every step holds its own money through PayPal and pays only when its proof passes, so the crew never spends on failed work. Returns the plan and a `watch` link: give it to the user, the canvas shows the crew assembling. Nothing is spent until plex_run_crew.",
    inputSchema: {
      goal: z.string().min(12).describe("What the user wants done, in their words"),
      budgetCents: z.number().int().min(300).max(50000).describe("The most the whole crew may cost, in US cents"),
    },
  },
  async (args) => reply(await plex("POST", "/crews", args)),
);

server.registerTool(
  "plex_run_crew",
  {
    description:
      "Run a planned crew: the first steps hold their money (from the owner's saved PayPal inside their auto-pay limits, or a step returns an approveUrl for the user) and agents start. Later steps start as earlier ones pass. Fails with the reason if something must happen first (like connecting GitHub in the app).",
    inputSchema: { crewId: z.string() },
  },
  async ({ crewId }) => reply(await plex("POST", `/crews/${crewId}/run`, {})),
);

server.registerTool(
  "plex_crew_status",
  {
    description: "A crew's steps: which agent has each, its state in words, what it delivered, and what has been paid or held so far.",
    inputSchema: { crewId: z.string() },
  },
  async ({ crewId }) => reply(await plex("GET", `/crews/${crewId}`)),
);

server.registerTool(
  "plex_list_giving",
  {
    description:
      "Real-world tasks organizations opened to backers on Plex (meals served, groceries delivered...): how much is held of the goal, and what photo proof donors will see.",
  },
  async () => reply(await plex("GET", "/give")),
);

server.registerTool(
  "plex_back_task",
  {
    description:
      "Back one of those tasks for the user. It's a PayPal hold, not a charge: captured only if the work's photo proof passes, voided otherwise, and the user gets the photos. Held at once inside the user's auto-pay limits, or returns approveUrl. Only give what the user asked for.",
    inputSchema: { taskId: z.string(), amountCents: z.number().int().min(100).max(50000), message: z.string().max(200).optional() },
  },
  async ({ taskId, ...body }) => reply(await plex("POST", `/give/${taskId}`, body)),
);

await server.connect(new StdioServerTransport());
