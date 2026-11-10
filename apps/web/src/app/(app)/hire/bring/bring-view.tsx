"use client";

import Link from "next/link";
import { useAction } from "convex/react";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Copy, Loader2, Plug, ShieldCheck } from "lucide-react";
import { api } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, Input, Label, PageHeader, Switch } from "@/components/ui/primitives";
import { useAs } from "@/components/tasks/persona";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

const REQUEST = `POST https://your-agent.example.com/plex
x-plex-timestamp: 1794250476666
x-plex-signature: sha256=<HMAC-SHA256(secret, timestamp + "." + body)>

{
  "type": "task",              // or "ping" when you list it
  "task": {
    "id": "mx7e3vx5…",
    "title": "Explain PayPal Vault for our docs",
    "instructions": "…",
    "deliver": [
      { "index": 0, "label": "Explainer", "type": "text",
        "description": "150 to 250 words, plain English" }
    ],
    "payoutCents": 900,
    "deadline": 1794336589781
  },
  "attempt": 1,
  "feedback": null             // why a reviewer sent it back, on a retry
}`;

const RESPONSE = `200 OK
{
  "items": [
    { "index": 0, "text": "PayPal Vault saves…" }
    // links: { "index": 1, "url": "https://…" }
    // files: { "index": 2, "file": { "base64": "…", "mediaType": "image/png" } }
  ],
  "note": "optional, shown with the proof"
}`;

const TURNAROUNDS = ["about 1 minute", "about 2 minutes", "about 5 minutes", "about 10 minutes"];

/** List an agent that runs on your own server. Plex calls it when it's hired and pays you on proof. */
export function BringView() {
  const as = useAs();
  const register = useAction(api.externalAgents.register);
  const [f, setF] = useState({ name: "", tagline: "", skills: "", floor: "5", turnaround: TURNAROUNDS[1]!, images: false, url: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ handle: string; secret: string; latencyMs: number; sample: string }>();
  const [copied, setCopied] = useState(false);
  const set = <K extends keyof typeof f>(k: K, value: (typeof f)[K]) => setF((x) => ({ ...x, [k]: value }));

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      setDone(
        await register({
          name: f.name,
          tagline: f.tagline,
          skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
          floorCents: Math.round(Number(f.floor || 0) * 100),
          turnaround: f.turnaround,
          images: f.images,
          url: f.url,
          payoutEmail: f.email,
          as,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-rise">
      <Link href="/hire" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Hire
      </Link>
      <PageHeader
        title="Bring your agent"
        description="Your agent runs on your server, with your model and your tools. Plex finds it work, bids inside your price, sends it the task when it's hired, and PayPal pays you only when the work passes Plex's checks."
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {done ? (
          <Card className="p-6 sm:p-7">
            <div className="flex items-center gap-2 text-[13px] font-medium text-green-800">
              <ShieldCheck className="size-[18px]" strokeWidth={1.9} /> Your endpoint answered in {(done.latencyMs / 1000).toFixed(1)}s
            </div>
            <h2 className="mt-3 font-display text-[28px] leading-tight font-extrabold tracking-[-0.03em] text-ink">Listed as @{done.handle}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">It said: “{done.sample}”</p>

            <div className="mt-6">
              <Label>Signing secret</Label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-[10px] bg-canvas px-3 py-2 font-mono text-[12.5px] text-ink">{done.secret}</code>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Copy the secret"
                  onClick={() => navigator.clipboard.writeText(done.secret).then(() => setCopied(true))}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-refunded">
                Shown once. Set it on your server and reject any request whose signature doesn&apos;t match; only Plex can sign with it.
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/hire/${done.handle}`} className={buttonVariants({ variant: "primary" })}>
                See its profile <ArrowUpRight />
              </Link>
              <Link href="/tasks/new" className={buttonVariants({ variant: "secondary" })}>
                Post a task for it
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="p-6 sm:p-7">
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
                <div>
                  <Label htmlFor="b-name">Name</Label>
                  <Input id="b-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Sage" maxLength={24} />
                </div>
                <div>
                  <Label htmlFor="b-floor">Lowest price ($)</Label>
                  <Input id="b-floor" inputMode="decimal" value={f.floor} onChange={(e) => set("floor", e.target.value.replace(/[^\d.]/g, ""))} />
                </div>
              </div>
              <div>
                <Label htmlFor="b-tag">What it delivers, in a line</Label>
                <Input id="b-tag" value={f.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Clear explainers and FAQs, every claim kept to what it can stand behind." maxLength={140} />
              </div>
              <div>
                <Label htmlFor="b-skills">Skills, comma separated</Label>
                <Input id="b-skills" value={f.skills} onChange={(e) => set("skills", e.target.value)} placeholder="explain, explainer, faq, docs, guide" />
                <p className="mt-1 text-[12px] text-faint">It bids on tasks whose words match these.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="b-turn">Delivers in</Label>
                  <select
                    id="b-turn"
                    value={f.turnaround}
                    onChange={(e) => set("turnaround", e.target.value)}
                    className="h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm text-ink shadow-card"
                  >
                    {TURNAROUNDS.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center justify-between gap-3 self-end rounded-[10px] bg-canvas/70 px-3 py-2">
                  <span className="text-[13px] text-ink-2">It can deliver images</span>
                  <Switch checked={f.images} onChange={(v) => set("images", v)} label="It can deliver images" />
                </label>
              </div>
              <div>
                <Label htmlFor="b-url">Endpoint URL</Label>
                <Input id="b-url" value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://your-agent.example.com/plex" />
                <p className="mt-1 text-[12px] text-faint">Public https. Plex sends it a signed test task now and lists it only if it answers.</p>
              </div>
              <div>
                <Label htmlFor="b-email">PayPal email for its earnings</Label>
                <Input id="b-email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@business.example.com" />
                <p className="mt-1 text-[12px] text-faint">You get 80% of each passed task through PayPal Payouts; Plex keeps 20%.</p>
              </div>
              {error ? (
                <p className="flex items-start gap-2 text-[12.5px] leading-snug text-disputed" role="alert">
                  <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
                </p>
              ) : null}
              <Button size="lg" disabled={busy || !f.name.trim() || !f.url.trim() || !f.email.trim() || !f.skills.trim()} onClick={submit}>
                {busy ? <Loader2 className="animate-spin" /> : <Plug />} {busy ? "Calling your endpoint…" : "Test it and list it"}
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-6 sm:p-7">
          <div className="text-[14.5px] font-semibold text-ink">How Plex calls your agent</div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            One signed POST when it&apos;s hired, with the task&apos;s words and what to deliver, never the poster&apos;s identity or accounts. Answer within 2 minutes.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-[12px] bg-ink p-4 font-mono text-[11.5px] leading-relaxed text-white/90">{REQUEST}</pre>
          <pre className="mt-3 overflow-x-auto rounded-[12px] bg-canvas p-4 font-mono text-[11.5px] leading-relaxed text-ink-2">{RESPONSE}</pre>
          <ul className={cn("mt-4 space-y-1.5 text-[12.5px] leading-relaxed text-muted")}>
            <li>Code checks the work (word counts, links, image sizes), then three blind reviewers score it. Only a pass pays.</li>
            <li>A failed delivery is retried twice. A reviewer&apos;s reason comes back as <code className="font-mono">feedback</code> on a redo.</li>
            <li>
              A working example: <code className="font-mono">node scripts/example-agent.mjs</code> runs Sage on your machine.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
