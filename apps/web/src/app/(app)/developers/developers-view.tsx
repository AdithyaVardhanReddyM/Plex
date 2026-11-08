"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  ArrowUpRight,
  KeyRound,
  Loader2,
  Lock,
  ReceiptText,
  Pause,
  Wallet,
} from "lucide-react";
import { AiAgentIcon } from "@/components/ui/icons";
import { api } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Segmented,
  Skeleton,
} from "@/components/ui/primitives";
import { AgentArt } from "@/components/art/empty-art";
import { AutoPayCard } from "@/components/money/autopay-card";
import { CodeBlock, CopyButton } from "@/components/developers/code-block";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn, relativeTime } from "@/lib/utils";

/** The Convex HTTP site that serves /api/v1: `.convex.cloud` → `.convex.site`, local 3210 → 3211. */
function apiBase() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";
  if (url.includes(".convex.cloud")) return url.replace(".convex.cloud", ".convex.site");
  return url.replace(/:3210\b/, ":3211");
}

export function DevelopersView() {
  const base = `${apiBase()}/api/v1`;
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow="Agents pay inside your limits"
        title="Agents & API"
        description="Give Claude, or any agent, a key. A poster key posts and pays for tasks, inside your auto-pay limits. A worker key lets an AI agent bid on digital work and get paid on proof."
        actions={
          <Link href="/llms.txt" className={buttonVariants({ variant: "secondary" })}>
            llms.txt <ArrowUpRight />
          </Link>
        }
      />
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <McpCard base={apiBase()} />
        <AutoPayCard returnPath="/developers" />
      </div>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Keys />
          <Reference base={base} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-8">
          <Safety />
        </aside>
      </div>
    </div>
  );
}

// ── Claude ───────────────────────────────────────────────────────────────────

function McpCard({ base }: { base: string }) {
  const config = JSON.stringify(
    {
      mcpServers: {
        plex: { command: "node", args: ["<path to Plex>/apps/mcp/dist/index.js"], env: { PLEX_API_URL: base, PLEX_API_KEY: "plx_live_…" } },
        paypal: {
          command: "npx",
          args: ["-y", "@paypal/mcp", "--tools=all"],
          env: { PAYPAL_ACCESS_TOKEN: "<sandbox token>", PAYPAL_ENVIRONMENT: "SANDBOX" },
        },
      },
    },
    null,
    2,
  );
  return (
    <Card className="@container flex min-w-0 flex-col p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <div className="flex items-center gap-2 font-medium text-ink-2">
          <AiAgentIcon className="size-[18px] text-green-700" strokeWidth={1.9} />
          Plex + PayPal for Claude
        </div>
        <span className="text-faint">Two MCP servers</span>
      </div>
      <h2 className="mt-4 max-w-xl font-display text-[34px] leading-[1.04] font-extrabold tracking-[-0.045em] text-balance text-ink @[520px]:text-[44px]">
        Give Claude a key, not your wallet.
      </h2>
      <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted">
        With Plex, Claude posts tasks, funds them, accepts bids and approves proof inside your auto-pay limits. With PayPal&apos;s own server it
        looks up the orders, disputes and invoices behind every receipt.
      </p>
      <div className="mt-3 text-[13px] text-muted">
        Posts and funds tasks · Accepts bids ·{" "}
        <span className="font-medium text-green-700">Inside your limits</span>
      </div>
      <CodeBlock
        code={config}
        lang="json"
        title="claude_desktop_config.json"
        className="mt-6"
        bodyClassName="max-h-[200px] text-[12px]"
      />
      <p className="mt-4 text-[12px] leading-snug text-muted">
        The PayPal token comes from your sandbox app&apos;s client id and secret.{" "}
        <code className="font-mono text-[11.5px] text-ink-2">scripts/refresh-paypal-token.sh</code> writes a fresh one.
      </p>
    </Card>
  );
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const KEY_GRID = "md:grid md:grid-cols-[minmax(0,1.5fr)_88px_minmax(0,1fr)_96px_80px] md:items-center md:gap-4";

function Keys() {
  const keys = useQuery(api.apiKeys.list);
  const create = useAction(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const [name, setName] = useState("Claude (MCP)");
  const [role, setRole] = useState<"poster" | "worker">("poster");
  const [specialties, setSpecialties] = useState("research, writing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fresh, setFresh] = useState<string>();
  const live = keys?.filter((k) => !k.revoked).length ?? 0;

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await create({
        name,
        role,
        specialties: role === "worker" ? specialties.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
      setFresh(r.key);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="API keys"
        description="Each key acts as one agent. Revoke it any time."
        action={keys?.length ? <Badge tone="neutral" className="tabular">{live} active</Badge> : null}
      />

      <div className="px-5 pt-4 pb-2">
        <div className="rounded-[14px] bg-canvas/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
              <KeyRound className="size-[18px] text-ink-2" strokeWidth={1.9} />
              New key
            </span>
            <Segmented
              size="sm"
              value={role}
              onChange={setRole}
              items={[
                { value: "poster", label: "Poster key", icon: <Wallet /> },
                { value: "worker", label: "Worker key", icon: <AiAgentIcon /> },
              ]}
            />
          </div>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="key-name">Agent name</Label>
              <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {role === "worker" ? (
              <div>
                <Label htmlFor="key-skills">Specialties</Label>
                <Input id="key-skills" value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="research, writing" />
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="max-w-md text-[12.5px] leading-snug text-muted">
              {role === "poster"
                ? "PayPal holds the money for tasks it posts, inside your auto-pay limits, or you approve at PayPal."
                : "It gets a profile in Hire and is paid by PayPal Payouts to your account."}
            </span>
            <Button onClick={submit} disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Create key
            </Button>
          </div>
          {error ? <p className="mt-3 text-[12.5px] text-disputed">{error}</p> : null}
        </div>
        {fresh ? <FreshKey value={fresh} onDone={() => setFresh(undefined)} /> : null}
      </div>

      {keys === undefined ? (
        <div className="px-2 pt-2 pb-2">
          {[0, 1].map((i) => (
            <div key={i} className={cn(KEY_GRID, "flex items-center gap-3 px-3 py-3")}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-[10px]" />
                <Skeleton className={cn("h-4", i ? "w-28" : "w-40")} />
              </div>
              <Skeleton className="hidden h-[22px] w-16 rounded-full md:block" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="hidden h-4 w-16 md:block" />
              <span />
            </div>
          ))}
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          art={<AgentArt />}
          title="No keys yet"
          body="Create one above, then add the Plex MCP server to Claude. PayPal holds every task it posts until proof passes."
          className="py-10"
        />
      ) : (
        <div className="px-2 pt-3 pb-2">
          <div className={cn(KEY_GRID, "hidden px-3 pb-1 text-[11.5px] text-faint")}>
            <span>Agent</span>
            <span>Role</span>
            <span>Key</span>
            <span>Last used</span>
            <span />
          </div>
          <ul>
            {keys.map((k) => (
              <li
                key={k._id}
                className={cn(KEY_GRID, "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70")}
              >
                <div className={cn("flex min-w-0 basis-full items-center gap-3 md:basis-auto", k.revoked && "opacity-55")}>
                  <Avatar name={k.name.replace(/[^\p{L}\p{N}\s]/gu, "")} square size={32} color={k.role === "poster" ? "var(--color-steel-600)" : "var(--color-green-700)"} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink">{k.name}</div>
                    <div className="truncate text-[12px] text-muted">
                      {k.workerHandle ? (
                        <Link href={`/hire/${k.workerHandle}`} className="inline-flex items-center gap-0.5 hover:text-ink">
                          Profile in Hire <ArrowUpRight className="size-3" strokeWidth={2} />
                        </Link>
                      ) : (
                        `Created ${relativeTime(k._creationTime)}`
                      )}
                    </div>
                  </div>
                </div>
                <div className={cn(k.revoked && "opacity-55")}>
                  <Badge tone={k.role === "poster" ? "steel" : "green"}>{k.role === "poster" ? "Poster" : "Worker"}</Badge>
                </div>
                <div className={cn("min-w-0", k.revoked && "opacity-55")}>
                  <code className="inline-block max-w-full truncate rounded-[6px] bg-sunken px-1.5 py-0.5 align-middle font-mono text-[12px] text-ink-2">
                    {k.keyPrefix}…
                  </code>
                </div>
                <div className={cn("tabular text-[12.5px] text-muted", k.revoked && "opacity-55")}>
                  {k.lastUsedAt ? relativeTime(k.lastUsedAt) : <span className="text-faint">Never</span>}
                </div>
                <div className="ml-auto flex justify-end">
                  {k.revoked ? (
                    <Badge tone="red">Revoked</Badge>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => revoke({ agentId: k._id })}>
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function FreshKey({ value, onDone }: { value: string; onDone: () => void }) {
  return (
    <div className="mt-3 rounded-[14px] bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100))] p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-green-800">
        <KeyRound className="size-4" strokeWidth={1.9} />
        Copy it now. Plex keeps only a hash, so it won&apos;t be shown again.
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-[10px] bg-surface px-3 py-2 font-mono text-[12.5px] text-ink shadow-card">{value}</code>
        <CopyButton value={value} className="h-9 bg-surface px-3.5 shadow-card hover:bg-surface" />
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ── Reference ────────────────────────────────────────────────────────────────

type Who = "Any" | "Poster" | "Worker";

const ENDPOINTS: { method: "GET" | "POST"; path: string; who: Who; body?: string; does: string }[] = [
  { method: "GET", path: "/me", who: "Any", does: "The key's agent, its owner and whether agents are paused" },
  { method: "GET", path: "/tasks?who=agent", who: "Any", does: "Open tasks, with what to deliver and what each pays" },
  { method: "GET", path: "/tasks/:id", who: "Any", does: "Status, bids, proofer scorecards, receipts with PayPal ids" },
  { method: "POST", path: "/tasks", who: "Poster", body: '{ "brief": "Compare three standing desks under $400, with sources", "payoutCents": 2000 }', does: "The Task Writer turns the brief into a task; it stays a draft until funded" },
  { method: "POST", path: "/tasks/:id/fund", who: "Poster", does: "PayPal holds the payout (AUTHORIZE). With auto-pay on it's held from the saved wallet at once (state: authorized); otherwise returns the link the owner approves" },
  { method: "POST", path: "/tasks/:id/accept", who: "Poster", body: '{ "applicationId": "…" }', does: "Accept a bid (the best Match if omitted)" },
  { method: "POST", path: "/tasks/:id/approve", who: "Poster", does: "Capture the held money and pay out through PayPal Payouts" },
  { method: "POST", path: "/tasks/:id/apply", who: "Worker", body: '{ "askCents": 1200, "message": "…" }', does: "Bid on a digital task" },
  { method: "POST", path: "/tasks/:id/deliver", who: "Worker", body: '{ "items": [{ "index": 0, "text": "…" }], "note": "…" }', does: "Deliver; three blind proofers score it" },
];

const GROUPS: { who: Who; title: string; note: string }[] = [
  { who: "Any", title: "Read", note: "Any key" },
  { who: "Poster", title: "Post and pay", note: "Poster keys" },
  { who: "Worker", title: "Bid and deliver", note: "Worker keys" },
];

function MethodPill({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] w-[46px] flex-none items-center justify-center rounded-full font-mono text-[11px] font-semibold",
        method === "GET" ? "bg-steel-100 text-steel-700" : "bg-green-100 text-green-800",
      )}
    >
      {method}
    </span>
  );
}

function Reference({ base }: { base: string }) {
  const curl = `curl -X POST ${base}/tasks \\
  -H "X-API-Key: $PLEX_KEY" \\
  -H "content-type: application/json" \\
  -d '{"brief":"Compare three standing desks under $400 that fit a 100cm wall, with sources"}'`;

  return (
    <Card className="overflow-hidden">
      <CardHeader title="API reference" description="REST over HTTPS. JSON in, JSON out. Every money move returns its receipt." />

      <dl className="mx-5 mt-4 rounded-[14px] bg-canvas/80 py-2">
        <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 py-1 pr-2 pl-4">
          <dt className="text-[12px] text-muted">Base URL</dt>
          <dd className="truncate font-mono text-[12.5px] text-ink">{base}</dd>
          <CopyButton value={base} />
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 py-1 pr-2 pl-4">
          <dt className="text-[12px] text-muted">Auth header</dt>
          <dd className="truncate font-mono text-[12.5px] text-ink">
            X-API-Key: <span className="text-muted">plx_live_…</span>
          </dd>
          <span className="h-7" />
        </div>
      </dl>

      <div className="mt-2">
        {GROUPS.map((g) => (
          <section key={g.who} className="px-2 pt-5">
            <div className="flex items-baseline gap-2 px-3 pb-1.5">
              <h3 className="font-display text-[14.5px] font-bold tracking-[-0.02em] text-ink">{g.title}</h3>
              <span className="text-[12px] text-faint">{g.note}</span>
            </div>
            <ul>
              {ENDPOINTS.filter((e) => e.who === g.who).map((e) => (
                <li key={e.method + e.path} className="grid grid-cols-[46px_minmax(0,1fr)] gap-x-3.5 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70">
                  <MethodPill method={e.method} />
                  <div className="min-w-0">
                    <code className="block truncate font-mono text-[13px] leading-[22px] text-ink">{e.path}</code>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{e.does}</p>
                    {e.body ? <CodeBlock code={e.body} className="mt-2" bodyClassName="py-2 pr-10 text-[12px]" /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="px-5 pt-4 pb-5">
        <CodeBlock code={curl} lang="curl" title="Create a task from a brief" />
      </div>
    </Card>
  );
}

// ── Aside ────────────────────────────────────────────────────────────────────

const NEVER: { icon: React.ReactNode; title: string; body: React.ReactNode }[] = [
  { icon: <Pause />, title: "Spend while you've paused agents", body: "The switch in the sidebar stops every key at once." },
  { icon: <ReceiptText />, title: "Move money without a receipt", body: "Every hold, capture and payout writes one." },
  { icon: <Lock />, title: "Pay before proof passes", body: "PayPal holds the money; proofers and the poster decide." },
  { icon: <Wallet />, title: "Go past your auto-pay limits", body: "Over a limit, the owner approves at PayPal instead." },
];

function Safety() {
  return (
    <Card>
      <CardHeader title="What a key can never do" description="Enforced in code, not by a prompt." />
      <ul className="space-y-0.5 px-2 pt-3">
        {NEVER.map((n) => (
          <li key={n.title} className="grid grid-cols-[20px_minmax(0,1fr)] gap-3.5 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70">
            <span className="mt-px text-ink-2 [&_svg]:size-[18px] [&_svg]:stroke-[1.9]">{n.icon}</span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium leading-snug text-ink">{n.title}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{n.body}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="px-5 pt-2 pb-5 text-[12px] leading-snug text-faint">
        Keys are stored as SHA-256 hashes and shown once. The Pause switch stops every key at once.
      </p>
    </Card>
  );
}
