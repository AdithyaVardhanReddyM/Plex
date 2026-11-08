"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, Wallet } from "lucide-react";
import { api } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Label, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn, formatCents, relativeTime } from "@/lib/utils";

/** Auto-pay: save a PayPal wallet once with PayPal Vault, so tasks are held without a popup. Held money, so the card is in steel. */
export function AutoPayCard({ returnPath, className }: { returnPath: "/developers" | "/settings" | "/onboarding"; className?: string }) {
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
    params.delete("autopay");
    window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : ""));
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
    <Card className={cn("flex min-w-0 flex-col p-6 sm:p-7", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
            <Wallet className="size-[18px]" strokeWidth={1.9} />
            Auto-pay
          </div>
          <div className="mt-0.5 text-[12px] text-faint">Saved with PayPal Vault</div>
        </div>
        {a === undefined || a === null ? null : <Badge tone={active ? "green" : "neutral"}>{active ? "On" : "Off"}</Badge>}
      </div>

      {a === undefined ? (
        <div className="mt-auto space-y-3 pt-10">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      ) : a === null ? (
        <p className="mt-auto pt-10 text-[13px] text-muted">Sign in to turn on auto-pay.</p>
      ) : active ? (
        <div className="mt-auto pt-8">
          <div className="flex items-end justify-between gap-3">
            <Amount cents={a.usedTodayCents} size="xl" className="text-[48px] text-steel-900" />
            <span className="tabular pb-1 text-[12px] font-medium text-muted">of {formatCents(a.dailyLimitCents)} today</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken" role="meter" aria-label="Held today" aria-valuenow={a.dailyLimitCents ? Math.round((a.usedTodayCents / a.dailyLimitCents) * 100) : 0}>
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{
                width: `${a.dailyLimitCents ? Math.min(100, (a.usedTodayCents / a.dailyLimitCents) * 100) : 0}%`,
                background: "var(--meter-steel)",
              }}
            />
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-steel-700">
            <ShieldCheck className="size-4 flex-none" strokeWidth={1.9} />
            <span className="truncate">{a.payerEmail ?? "PayPal wallet"}</span>
            <span className="flex-none font-normal text-muted">· {a.lastUsedAt ? `used ${relativeTime(a.lastUsedAt)}` : "not used yet"}</span>
          </div>

          <div className="mt-6">
            <div className="grid grid-cols-2 gap-3">
              <MoneyField id="ap-per" label="Up to, per task" value={perValue} onChange={setPer} />
              <MoneyField id="ap-daily" label="Up to, per day" value={dailyValue} onChange={setDaily} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button variant="danger" size="sm" disabled={!!busy} onClick={() => run("off", () => turnOff({}))}>
                {busy === "off" ? <Loader2 className="animate-spin" /> : null} Turn off and remove
              </Button>
              <Button
                variant="secondary"
                size="sm"
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
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">Over a limit, you approve at PayPal as before.</p>
        </div>
      ) : (
        <>
          <p className="mt-6 max-w-[300px] text-[13px] leading-relaxed text-muted">
            Save your PayPal once. Tasks you or your agents post are then held without a checkout popup, and still charged only when the
            proof passes.
          </p>
          <div className="mt-auto pt-8">
            <Amount cents={a.limitCents} size="xl" className="text-[48px] text-steel-900" />
            <div className="tabular mt-3 text-[13px] font-medium text-steel-700">
              per task without a popup · up to {formatCents(a.dailyLimitCents)} a day
            </div>
            <Button
              variant="brand"
              size="lg"
              className="mt-5 w-full"
              disabled={!!busy}
              onClick={() =>
                run("start", async () => {
                  const r = await start({ origin: window.location.origin, returnPath });
                  window.location.assign(r.approveUrl);
                })
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : <Wallet />} {busy === "finish" ? "Saving your PayPal…" : "Turn on with PayPal"}
            </Button>
            <p className="mt-2.5 text-center text-[12px] text-muted">One approval at PayPal, no charge.</p>
          </div>
        </>
      )}
      {error ? <p className="mt-3 rounded-[10px] bg-disputed-bg px-3 py-2 text-[12.5px] text-disputed">{error}</p> : null}
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

