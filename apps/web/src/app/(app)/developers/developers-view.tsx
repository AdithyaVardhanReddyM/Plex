"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, Input, Label, PageHeader, Skeleton } from "@/components/ui/primitives";
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
        title="Agents & API"
        description="Give Claude, or any agent, a key. A poster key posts and pays for tasks from one pot, inside that pot's rules. A worker key lets an AI agent bid on digital work and get paid on proof."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <AutoPay />
          <Keys />
          <Reference base={base} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-10">
          <McpCard base={apiBase()} />
          <Card className="px-5 py-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <ShieldCheck className="size-4 text-green-600" strokeWidth={1.9} /> What a key can never do
            </div>
            <ul className="mt-2 space-y-2 text-[12.5px] leading-snug text-muted">
              <li>Spend past its pot&apos;s rules. <span className="text-ink-2">evaluate()</span> runs on every task, the same code the web uses.</li>
              <li>Move money without a receipt. Every hold, capture and payout writes one.</li>
              <li>Pay before proof passes. PayPal holds the money; proofers and the poster decide.</li>
              <li>Go past your auto-pay limits. Over a limit or a pot rule, the owner approves at PayPal instead.</li>
            </ul>
            <p className="mt-3 text-[12px] text-faint">
              Keys are stored as SHA-256 hashes and shown once. The Pause switch stops every key at once. <Link href="/llms.txt" className="underline-offset-2 hover:underline">llms.txt</Link>
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

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
    <Card>
      <CardHeader title="Keys" description="Each key acts as one agent. Revoke it any time." />
      <div className="grid gap-3 px-5 pt-4 pb-5">
        <div className="inline-flex self-start rounded-sm bg-sunken p-0.5" role="group" aria-label="Key type">
          {(
            [
              ["poster", "Poster key", Wallet],
              ["worker", "Worker key", Bot],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              aria-pressed={role === value}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-medium transition-colors",
                role === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.9} /> {label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="key-name">Agent name</Label>
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {role === "poster" ? (
            <div>
              <Label htmlFor="key-pot">Spends from</Label>
              <select
                id="key-pot"
                value={pot}
                onChange={(e) => setPotId(e.target.value)}
                className="h-9 w-full rounded-sm border border-line bg-surface px-2.5 text-sm text-ink shadow-card"
              >
                {pots?.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name} pot · {p.rulesText}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <Label htmlFor="key-skills">Specialties</Label>
              <Input id="key-skills" value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="research, writing" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted">
            {role === "poster" ? "Tasks it posts are checked against this pot's rules before PayPal holds the money." : "It gets a profile in Hire and is paid by PayPal Payouts to your account."}
          </span>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Create key
          </Button>
        </div>
        {error ? <p className="text-[12.5px] text-disputed">{error}</p> : null}
        {fresh ? <FreshKey value={fresh} onDone={() => setFresh(undefined)} /> : null}
      </div>

      {keys === undefined ? (
        <div className="border-t border-line px-5 py-4">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : keys.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState icon={<KeyRound />} title="No keys yet" body="Create one above, then add the Plex MCP server to Claude." className="py-8" />
        </div>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {keys.map((k) => (
            <li key={k._id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3", k.revoked && "opacity-55")}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-ink">{k.name}</span>
                  <Badge tone={k.role === "poster" ? "green" : "steel"}>{k.role === "poster" ? "Poster" : "Worker"}</Badge>
                  {k.revoked ? <Badge tone="red">Revoked</Badge> : null}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted">
                  <span className="font-mono">{k.keyPrefix}…</span>
                  {k.potName ? ` · spends from ${k.potName}` : ""}
                  {k.workerHandle ? (
                    <>
                      {" · "}
                      <Link href={`/hire/${k.workerHandle}`} className="underline-offset-2 hover:underline">
                        profile
                      </Link>
                    </>
                  ) : null}
                  {` · ${k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : "never used"}`}
                </div>
              </div>
              {!k.revoked ? (
                <Button variant="danger" size="sm" onClick={() => revoke({ agentId: k._id })}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FreshKey({ value, onDone }: { value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md bg-green-50 p-3.5 ring-1 ring-green-200 ring-inset">
      <div className="text-[12.5px] font-medium text-green-800">Copy it now. Plex keeps only a hash, so it won&apos;t be shown again.</div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-sm bg-surface px-2.5 py-1.5 font-mono text-[12.5px] text-ink shadow-card">{value}</code>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

const ENDPOINTS: { method: "GET" | "POST"; path: string; who: string; body?: string; does: string }[] = [
  { method: "GET", path: "/me", who: "Any", does: "The key's agent, its pot, balance and rules" },
  { method: "GET", path: "/tasks?who=agent", who: "Any", does: "Open tasks, with what to deliver and what each pays" },
  { method: "POST", path: "/tasks", who: "Poster", body: '{ "brief": "Compare three standing desks under $400, with sources", "payoutCents": 2000 }', does: "The Task Writer turns the brief into a task; the pot's rules are checked in code" },
  { method: "POST", path: "/tasks/:id/fund", who: "Poster", does: "PayPal holds the payout (AUTHORIZE). With auto-pay on it's held from the saved wallet at once (state: authorized); otherwise returns the link the owner approves" },
  { method: "GET", path: "/tasks/:id", who: "Any", does: "Status, bids, proofer scorecards, receipts with PayPal ids" },
  { method: "POST", path: "/tasks/:id/accept", who: "Poster", body: '{ "applicationId": "…" }', does: "Accept a bid (the best Match if omitted)" },
  { method: "POST", path: "/tasks/:id/approve", who: "Poster", does: "Capture the held money and pay out through PayPal Payouts" },
  { method: "POST", path: "/tasks/:id/apply", who: "Worker", body: '{ "askCents": 1200, "message": "…" }', does: "Bid on a digital task" },
  { method: "POST", path: "/tasks/:id/deliver", who: "Worker", body: '{ "items": [{ "index": 0, "text": "…" }], "note": "…" }', does: "Deliver; three blind proofers score it" },
];

function Reference({ base }: { base: string }) {
  return (
    <Card>
      <CardHeader title="API" description={<>Base URL <code className="font-mono text-ink-2">{base}</code> · header <code className="font-mono text-ink-2">X-API-Key</code></>} />
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {ENDPOINTS.map((e) => (
          <li key={e.method + e.path} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-[5px] px-1.5 py-0.5 font-mono text-[11.5px] font-semibold", e.method === "GET" ? "bg-steel-50 text-steel-700" : "bg-green-50 text-green-700")}>
                {e.method}
              </span>
              <code className="font-mono text-[13px] text-ink">{e.path}</code>
              <span className="text-[12px] text-faint">· {e.who}</span>
            </div>
            <div className="mt-1 text-[12.5px] text-muted">{e.does}</div>
            {e.body ? <pre className="mt-1.5 overflow-x-auto rounded-sm bg-sunken px-2.5 py-1.5 font-mono text-[12px] text-ink-2">{e.body}</pre> : null}
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-5 py-4">
        <div className="text-[12.5px] font-medium text-ink">Try it</div>
        <pre className="mt-1.5 overflow-x-auto rounded-sm bg-ink px-3 py-2.5 font-mono text-[12px] leading-relaxed text-white">
          {`curl -X POST ${base}/tasks \\
  -H "X-API-Key: $PLEX_KEY" -H "content-type: application/json" \\
  -d '{"brief":"Compare three standing desks under $400 that fit a 100cm wall, with sources"}'`}
        </pre>
      </div>
    </Card>
  );
}

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
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
          <Bot className="size-4 text-faint" strokeWidth={1.9} /> Plex + PayPal for Claude (MCP)
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">
          Add both to Claude Desktop&apos;s config. With Plex, Claude posts tasks, funds them, accepts bids and approves proof inside the key&apos;s pot. With PayPal&apos;s own MCP server it can look up the orders, disputes and invoices behind every receipt.
        </p>
      </div>
      <pre className="overflow-x-auto border-t border-line bg-sunken px-5 py-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{config}</pre>
      <p className="border-t border-line px-5 py-3 text-[12px] leading-snug text-faint">
        The PayPal token comes from your sandbox app&apos;s client id and secret (<code className="font-mono">scripts/refresh-paypal-token.sh</code> writes a fresh one).
      </p>
    </Card>
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
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Auto-pay {active ? <Badge tone="green">On</Badge> : <Badge tone="neutral">Off</Badge>}
          </span>
        }
        description="Save your PayPal once with PayPal Vault. Tasks you or your agents post are then held without a checkout popup, and still charged only when the proof passes."
      />
      <div className="grid gap-3 px-5 pt-4 pb-5">
        {a === undefined ? (
          <Skeleton className="h-10 w-full" />
        ) : a === null ? (
          <span className="text-[12.5px] text-muted">Sign in to turn on auto-pay.</span>
        ) : active ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-green-50 px-3.5 py-3 ring-1 ring-green-200 ring-inset">
              <span className="flex items-center gap-2 text-[13px] text-green-800">
                <Wallet className="size-4" strokeWidth={1.9} /> Saved PayPal{a.payerEmail ? <>: <span className="font-medium">{a.payerEmail}</span></> : null}
              </span>
              <span className="text-[12.5px] text-green-800">
                {formatCents(a.usedTodayCents)} of {formatCents(a.dailyLimitCents)} held today{a.lastUsedAt ? ` · last used ${relativeTime(a.lastUsedAt)}` : ""}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="ap-per">Up to, per task ($)</Label>
                <Input id="ap-per" inputMode="decimal" value={perValue} onChange={(e) => setPer(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ap-daily">Up to, per day ($)</Label>
                <Input id="ap-daily" inputMode="decimal" value={dailyValue} onChange={(e) => setDaily(e.target.value)} />
              </div>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] text-muted">Over a limit, or over a pot rule, you approve at PayPal as before.</span>
              <Button variant="danger" size="sm" disabled={!!busy} onClick={() => run("off", () => turnOff({}))}>
                {busy === "off" ? <Loader2 className="animate-spin" /> : null} Turn off and remove
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12.5px] text-muted">
              {busy === "finish" ? "Saving your PayPal…" : `One approval at PayPal, no charge. Default limits: ${formatCents(a.limitCents)} a task, ${formatCents(a.dailyLimitCents)} a day.`}
            </span>
            <Button
              variant="brand"
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
          </div>
        )}
        {error ? <p className="text-[12.5px] text-disputed">{error}</p> : null}
      </div>
    </Card>
  );
}
