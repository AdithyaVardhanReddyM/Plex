"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  CodeXml,
  KeyRound,
  Loader2,
  Lock,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  IconTile,
  Input,
  Label,
  Meter,
  PageHeader,
  Segmented,
  Skeleton,
  StatusDot,
} from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { AgentArt } from "@/components/art/empty-art";
import { CodeBlock, CopyButton } from "@/components/developers/code-block";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn, formatCents, relativeTime } from "@/lib/utils";

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
        icon={<CodeXml />}
        title="Agents & API"
        description="Give Claude, or any agent, a key. A poster key posts and pays for tasks from one pot, inside that pot's rules. A worker key lets an AI agent bid on digital work and get paid on proof."
        actions={
          <Link href="/llms.txt" className={buttonVariants({ variant: "secondary" })}>
            llms.txt <ArrowUpRight />
          </Link>
        }
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <AutoPay />
          <Keys />
          <Reference base={base} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <McpCard base={apiBase()} />
          <Safety />
        </aside>
      </div>
    </div>
  );
}

// ── Auto-pay ─────────────────────────────────────────────────────────────────

function StateCapsule({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium ring-1 ring-inset",
        on ? "bg-green-50 text-green-800 ring-green-200/80" : "bg-surface text-muted ring-line",
      )}
    >
      <StatusDot tone={on ? "green" : "faint"} />
      {label}
    </span>
  );
}

/** Auto-pay: save a PayPal wallet once with PayPal Vault, so tasks are held without a popup. */
function AutoPay() {
  const a = useQuery(api.autopay.mine, {});
  const start = useAction(api.autopay.start);
  const finish = useAction(api.autopay.finish);
  const turnOff = useAction(api.autopay.turnOff);
  const setLimits = useMutation(api.autopay.setLimits);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [per, setPer] = useState<string>();
  const [daily, setDaily] = useState<string>();

  async function run(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(undefined);
    }
  }

  // Back from PayPal: turn the approved setup token into the saved wallet.
  const returned = useRef(false);
  useEffect(() => {
    if (returned.current) return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("autopay");
    if (!flag) return;
    returned.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    if (flag === "return")
      queueMicrotask(() =>
        run("finish", async () => {
          const r = await finish({});
          if (r.status === "not_approved") throw new Error("PayPal didn't confirm the approval. Try again.");
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = a?.status === "active";
  const perValue = per ?? (a ? String(a.limitCents / 100) : "");
  const dailyValue = daily ?? (a ? String(a.dailyLimitCents / 100) : "");

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <IconTile tone={active ? "mint" : "neutral"}>
          <Wallet />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] font-semibold tracking-[-0.012em] text-ink">Auto-pay</span>
            {a === undefined ? null : <StateCapsule on={active} label={active ? "On" : "Off"} />}
          </div>
          <p className="mt-0.5 max-w-xl text-[13px] leading-snug text-muted">
            Save your PayPal once with PayPal Vault. Tasks you or your agents post are then held without a checkout popup, and still charged only when the proof passes.
          </p>
        </div>
        {a && !active ? (
          <Button
            variant="brand"
            className="self-start"
            disabled={!!busy}
            onClick={() =>
              run("start", async () => {
                const r = await start({ origin: window.location.origin });
                window.location.assign(r.approveUrl);
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <Wallet />} Turn on with PayPal
          </Button>
        ) : null}
      </div>

      {a === undefined ? (
        <div className="border-t border-line px-5 py-4">
          <Skeleton className="h-10 w-full rounded-[10px]" />
        </div>
      ) : a === null ? (
        <div className="border-t border-line px-5 py-4 text-[12.5px] text-muted">Sign in to turn on auto-pay.</div>
      ) : active ? (
        <>
          <dl className="grid border-t border-line bg-canvas/40 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="min-w-0 px-5 py-4">
              <dt className="text-[12px] text-muted">Saved PayPal</dt>
              <dd className="mt-1.5 flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink">
                <ShieldCheck className="size-4 flex-none text-green-700" strokeWidth={1.9} />
                <span className="truncate">{a.payerEmail ?? "PayPal wallet"}</span>
              </dd>
              <dd className="mt-1 text-[12px] text-faint">{a.lastUsedAt ? `Last used ${relativeTime(a.lastUsedAt)}` : "Not used yet"}</dd>
            </div>
            <div className="min-w-0 border-t border-line px-5 py-4 sm:border-t-0 sm:border-l">
              <dt className="flex items-center justify-between text-[12px] text-muted">
                <span>Held today</span>
                <span className="tabular text-faint">of {formatCents(a.dailyLimitCents)}</span>
              </dt>
              <dd className="mt-1.5">
                <Amount cents={a.usedTodayCents} size="md" />
                <Meter value={a.dailyLimitCents ? a.usedTodayCents / a.dailyLimitCents : 0} tone="steel" size="sm" className="mt-2" label="Held today" />
              </dd>
            </div>
          </dl>
          <div className="border-t border-line px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <MoneyField id="ap-per" label="Up to, per task" value={perValue} onChange={setPer} />
              <MoneyField id="ap-daily" label="Up to, per day" value={dailyValue} onChange={setDaily} />
              <Button
                variant="secondary"
                disabled={!!busy || (per === undefined && daily === undefined)}
                onClick={() =>
                  run("limits", async () => {
                    await setLimits({ limitCents: Math.round(Number(perValue) * 100), dailyLimitCents: Math.round(Number(dailyValue) * 100) });
                    setPer(undefined);
                    setDaily(undefined);
                  })
                }
              >
                {busy === "limits" ? <Loader2 className="animate-spin" /> : null} Save limits
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] text-muted">Over a limit, or over a pot rule, you approve at PayPal as before.</span>
              <Button variant="danger" size="sm" disabled={!!busy} onClick={() => run("off", () => turnOff({}))}>
                {busy === "off" ? <Loader2 className="animate-spin" /> : null} Turn off and remove
              </Button>
            </div>
          </div>
        </>
      ) : (
        <dl className="grid grid-cols-1 border-t border-line bg-canvas/40 sm:grid-cols-3">
          {[
            { label: "To set up", value: busy === "finish" ? "Saving your PayPal…" : "One approval, no charge" },
            { label: "Per task", value: `Up to ${formatCents(a.limitCents)}` },
            { label: "Per day", value: `Up to ${formatCents(a.dailyLimitCents)}` },
          ].map((f, i) => (
            <div key={f.label} className={cn("px-5 py-3.5", i > 0 && "border-t border-line sm:border-t-0 sm:border-l")}>
              <dt className="text-[12px] text-muted">{f.label}</dt>
              <dd className="tabular mt-1 text-[13.5px] font-medium text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {error ? <p className="border-t border-line px-5 py-3 text-[12.5px] text-disputed">{error}</p> : null}
    </Card>
  );
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13.5px] text-faint">$</span>
        <Input id={id} inputMode="decimal" className="tabular pl-6" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const KEY_GRID = "md:grid md:grid-cols-[minmax(0,1.5fr)_88px_minmax(0,1fr)_104px_80px] md:items-center md:gap-4";

function Keys() {
  const keys = useQuery(api.apiKeys.list);
  const pots = useQuery(api.pots.list);
  const create = useAction(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const [name, setName] = useState("Claude (MCP)");
  const [role, setRole] = useState<"poster" | "worker">("poster");
  const [potId, setPotId] = useState<string>("");
  const [specialties, setSpecialties] = useState("research, writing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fresh, setFresh] = useState<string>();
  const pot = potId || pots?.find((p) => p.name === "Errands")?._id || pots?.[0]?._id || "";
  const live = keys?.filter((k) => !k.revoked).length ?? 0;

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await create({
        name,
        role,
        potId: role === "poster" && pot ? (pot as Id<"pots">) : undefined,
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
        action={keys?.length ? <Badge tone="outline" className="tabular">{live} active</Badge> : null}
      />

      <div className="px-5 pt-4 pb-5">
        <div className="rounded-[12px] border border-line bg-canvas/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink">New key</span>
            <Segmented
              size="sm"
              value={role}
              onChange={setRole}
              items={[
                { value: "poster", label: "Poster key", icon: <Wallet /> },
                { value: "worker", label: "Worker key", icon: <Bot /> },
              ]}
            />
          </div>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="key-name">Agent name</Label>
              <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {role === "poster" ? (
              <div>
                <Label htmlFor="key-pot">Spends from</Label>
                <div className="relative">
                  <select
                    id="key-pot"
                    value={pot}
                    onChange={(e) => setPotId(e.target.value)}
                    className="h-9 w-full appearance-none truncate rounded-[10px] border border-line bg-surface pr-9 pl-3 text-sm text-ink shadow-card transition-[border-color,box-shadow] hover:border-line-strong focus:border-green-500 focus:ring-[3px] focus:ring-green-100 focus:outline-none"
                  >
                    {pots?.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} pot · {p.rulesText}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-faint" strokeWidth={1.9} />
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="key-skills">Specialties</Label>
                <Input id="key-skills" value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="research, writing" />
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="max-w-md text-[12.5px] leading-snug text-muted">
              {role === "poster"
                ? "Tasks it posts are checked against this pot's rules before PayPal holds the money."
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
        <div className="border-t border-line">
          {[0, 1].map((i) => (
            <div key={i} className={cn(KEY_GRID, "px-5 py-3.5")}>
              <Skeleton className={cn("h-4", i ? "w-28" : "w-40")} />
              <Skeleton className="hidden h-[22px] w-16 rounded-full md:block" />
              <Skeleton className="hidden h-4 w-24 md:block" />
              <Skeleton className="hidden h-4 w-16 md:block" />
              <span />
            </div>
          ))}
        </div>
      ) : keys.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState
            art={<AgentArt />}
            title="No keys yet"
            body="Create one above, then add the Plex MCP server to Claude. Every task it posts is checked against its pot's rules."
            className="py-10"
          />
        </div>
      ) : (
        <div className="border-t border-line">
          <div className={cn(KEY_GRID, "hidden bg-canvas/40 px-5 py-2 text-[11.5px] text-faint")}>
            <span>Agent</span>
            <span>Role</span>
            <span>Key</span>
            <span>Last used</span>
            <span />
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {keys.map((k) => (
              <li key={k._id} className={cn(KEY_GRID, "flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3")}>
                <div className={cn("min-w-0 basis-full md:basis-auto", k.revoked && "opacity-55")}>
                  <div className="truncate text-[13.5px] font-medium text-ink">{k.name}</div>
                  <div className="truncate text-[12px] text-muted">
                    {k.potName ? `Spends from ${k.potName}` : k.workerHandle ? (
                      <Link href={`/hire/${k.workerHandle}`} className="inline-flex items-center gap-0.5 hover:text-ink">
                        Profile in Hire <ArrowUpRight className="size-3" strokeWidth={2} />
                      </Link>
                    ) : (
                      `Created ${relativeTime(k._creationTime)}`
                    )}
                  </div>
                </div>
                <div className={cn(k.revoked && "opacity-55")}>
                  <Badge tone={k.role === "poster" ? "steel" : "green"}>
                    {k.role === "poster" ? <Wallet /> : <Bot />}
                    {k.role === "poster" ? "Poster" : "Worker"}
                  </Badge>
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
    <div className="mt-3 rounded-[12px] bg-green-50 p-4 ring-1 ring-green-200 ring-inset">
      <div className="flex items-center gap-2 text-[13px] font-medium text-green-800">
        <KeyRound className="size-4" strokeWidth={1.9} />
        Copy it now. Plex keeps only a hash, so it won&apos;t be shown again.
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-[10px] border border-green-200 bg-surface px-3 py-2 font-mono text-[12.5px] text-ink">{value}</code>
        <CopyButton value={value} className="h-9 border border-line bg-surface px-3.5 shadow-card hover:bg-surface" />
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
  { method: "GET", path: "/me", who: "Any", does: "The key's agent, its pot, balance and rules" },
  { method: "GET", path: "/tasks?who=agent", who: "Any", does: "Open tasks, with what to deliver and what each pays" },
  { method: "GET", path: "/tasks/:id", who: "Any", does: "Status, bids, proofer scorecards, receipts with PayPal ids" },
  { method: "POST", path: "/tasks", who: "Poster", body: '{ "brief": "Compare three standing desks under $400, with sources", "payoutCents": 2000 }', does: "The Task Writer turns the brief into a task; the pot's rules are checked in code" },
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
        "inline-flex h-[22px] w-[46px] flex-none items-center justify-center rounded-[6px] font-mono text-[11px] font-semibold ring-1 ring-inset",
        method === "GET" ? "bg-steel-50 text-steel-700 ring-steel-100" : "bg-green-50 text-green-800 ring-green-100",
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

      <dl className="mx-5 mt-4 divide-y divide-line rounded-[12px] border border-line bg-canvas/50">
        <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 pr-1.5 pl-3.5">
          <dt className="text-[12px] text-muted">Base URL</dt>
          <dd className="truncate font-mono text-[12.5px] text-ink">{base}</dd>
          <CopyButton value={base} />
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-3 py-1.5 pr-1.5 pl-3.5">
          <dt className="text-[12px] text-muted">Auth header</dt>
          <dd className="truncate font-mono text-[12.5px] text-ink">
            X-API-Key: <span className="text-muted">plx_live_…</span>
          </dd>
          <span className="h-7" />
        </div>
      </dl>

      <div className="mt-2">
        {GROUPS.map((g) => (
          <section key={g.who} className="px-2 pt-3">
            <div className="flex items-baseline gap-2 px-3 pb-1">
              <h3 className="text-[13px] font-semibold text-ink">{g.title}</h3>
              <span className="text-[12px] text-faint">{g.note}</span>
            </div>
            <ul>
              {ENDPOINTS.filter((e) => e.who === g.who).map((e) => (
                <li key={e.method + e.path} className="grid grid-cols-[46px_minmax(0,1fr)] gap-x-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-sunken/50">
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

      <div className="mt-3 border-t border-line p-5">
        <CodeBlock code={curl} lang="curl" title="Create a task from a brief" />
      </div>
    </Card>
  );
}

// ── Aside ────────────────────────────────────────────────────────────────────

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
    <Card className="overflow-hidden">
      <CardHeader
        icon={<Bot />}
        title="Plex + PayPal for Claude"
        description="Two MCP servers for Claude Desktop."
      />
      <p className="px-5 pt-3 text-[12.5px] leading-relaxed text-muted">
        With Plex, Claude posts tasks, funds them, accepts bids and approves proof inside the key&apos;s pot. With PayPal&apos;s own server it looks up the orders, disputes and invoices behind every receipt.
      </p>
      <div className="p-4">
        <CodeBlock code={config} lang="json" title="claude_desktop_config.json" bodyClassName="max-h-[360px] text-[12px]" />
      </div>
      <p className="border-t border-line bg-canvas/40 px-5 py-3 text-[12px] leading-snug text-muted">
        The PayPal token comes from your sandbox app&apos;s client id and secret.{" "}
        <code className="font-mono text-[11.5px] text-ink-2">scripts/refresh-paypal-token.sh</code> writes a fresh one.
      </p>
    </Card>
  );
}

const NEVER: { icon: React.ReactNode; title: string; body: React.ReactNode }[] = [
  {
    icon: <SlidersHorizontal />,
    title: "Spend past its pot's rules",
    body: (
      <>
        <code className="font-mono text-[11.5px] text-ink-2">evaluate()</code> runs on every task, the same code the web uses.
      </>
    ),
  },
  { icon: <ReceiptText />, title: "Move money without a receipt", body: "Every hold, capture and payout writes one." },
  { icon: <Lock />, title: "Pay before proof passes", body: "PayPal holds the money; proofers and the poster decide." },
  { icon: <Wallet />, title: "Go past your auto-pay limits", body: "Over a limit or a pot rule, the owner approves at PayPal instead." },
];

function Safety() {
  return (
    <Card>
      <CardHeader icon={<ShieldCheck />} title="What a key can never do" description="Enforced in code, not by a prompt." />
      <ul className="mt-2 px-5">
        {NEVER.map((n) => (
          <li key={n.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-line py-3 first:border-t-0">
            <IconTile tone="neutral" size="sm">
              {n.icon}
            </IconTile>
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-snug text-ink">{n.title}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{n.body}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-line bg-canvas/40 px-5 py-3 text-[12px] leading-snug text-muted">
        Keys are stored as SHA-256 hashes and shown once. The Pause switch stops every key at once.
      </p>
    </Card>
  );
}
