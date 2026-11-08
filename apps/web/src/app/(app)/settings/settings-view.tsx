"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, ArrowUpRight, Check, Loader2, LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { ALL_WORK_INTERESTS, MI_PER_KM } from "@plex/backend/lib/profile";
import { api } from "@/lib/convex";
import { CLERK_ENABLED } from "@/components/providers";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, Input, Label, PageHeader, Segmented, Skeleton, Textarea } from "@/components/ui/primitives";
import { AutoPayCard } from "@/components/money/autopay-card";
import { AvatarPicker } from "@/components/onboarding/avatar-picker";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

type State = NonNullable<ReturnType<typeof useSettingsState>>;
function useSettingsState() {
  return useQuery(api.onboarding.state);
}

export function SettingsView() {
  const s = useSettingsState();

  // /settings#getting-paid: scroll once the section exists.
  useEffect(() => {
    if (!s || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [s]);

  return (
    <div className="animate-rise">
      <PageHeader title="Settings" description="Your profile, what you use Plex for, and how money moves in and out." />
      {s === undefined ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : s === null ? (
        <Card className="p-6 text-[14px] text-muted">Sign in to see your settings.</Card>
      ) : (
        <div className="flex flex-col gap-12">
          <Profile s={s} />
          <Sides s={s} />
          {s.roles.poster ? <Paying s={s} /> : null}
          {s.roles.doer ? <GettingPaid s={s} /> : null}
          {CLERK_ENABLED && !s.isGuest ? <Account /> : null}
        </div>
      )}
    </div>
  );
}

/** A settings group: what it is on the left, the controls on the right. */
function Section({ id, title, body, children }: { id?: string; title: string; body: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-8 gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="font-display text-[22px] font-bold tracking-[-0.03em] text-ink">{title}</h2>
        <div className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function useSaver() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, saved, run };
}

function SaveRow({ busy, saved, error, disabled, onSave }: { busy: boolean; saved: boolean; error?: string; disabled?: boolean; onSave: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <Button onClick={onSave} disabled={busy || disabled}>
        {busy ? <Loader2 className="animate-spin" /> : saved ? <Check /> : null} {saved ? "Saved" : "Save"}
      </Button>
      {error ? <span className="text-[13px] text-disputed">{error}</span> : null}
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

function Profile({ s }: { s: State }) {
  const update = useMutation(api.users.updateProfile);
  const [name, setName] = useState(s.name);
  const [avatarUrl, setAvatarUrl] = useState(s.avatarUrl);
  const [bio, setBio] = useState(s.bio ?? "");
  const save = useSaver();
  const dirty = name !== s.name || avatarUrl !== s.avatarUrl || bio !== (s.bio ?? "");
  return (
    <Section title="Profile" body={<>What people and agents see on your tasks, applications and receipts. You&apos;re <span className="font-medium text-ink-2">@{s.handle}</span>.</>}>
      <Card className="p-6">
        <AvatarPicker name={name} value={avatarUrl} accountPhoto={s.accountPhoto} onChange={setAvatarUrl} />
        <div className="mt-6 grid gap-5">
          <div>
            <Label htmlFor="st-name">Name</Label>
            <Input id="st-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
          </div>
          {s.roles.doer ? (
            <div>
              <Label htmlFor="st-bio">About you</Label>
              <Textarea id="st-bio" value={bio} maxLength={400} onChange={(e) => setBio(e.target.value)} placeholder="A line or two about the work you take" />
            </div>
          ) : null}
        </div>
        <SaveRow
          {...save}
          disabled={!dirty || !name.trim() || s.isGuest}
          onSave={() => save.run(() => update({ name, ...(avatarUrl ? { avatarUrl } : {}), ...(s.roles.doer ? { bio } : {}) }))}
        />
      </Card>
    </Section>
  );
}

// ── Which sides ──────────────────────────────────────────────────────────────

function Sides({ s }: { s: State }) {
  const back = encodeURIComponent("/settings");
  const work = ALL_WORK_INTERESTS.filter((i) => s.interests.work?.includes(i.id)).map((i) => i.label);
  const radius = s.place ? (s.place.unit === "mi" ? `${Math.round(s.place.radiusKm * MI_PER_KM)} mi` : `${Math.round(s.place.radiusKm)} km`) : null;
  return (
    <Section title="How you use Plex" body="Posting and earning are set up separately. Turn on the other side whenever you want; we only ask what it needs.">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[16px] font-semibold text-ink">Posting tasks</div>
            {s.roles.poster ? <OnLabel /> : null}
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            {s.roles.poster
              ? `Default: ${s.postDefaults?.workerType === "human" ? "people" : s.postDefaults?.workerType === "agent" ? "AI agents" : "people or agents"}, ${s.postDefaults?.approval === "auto" ? "paid when every check passes" : "you approve each payment"}.`
              : "Get errands, checks and online work done by people or AI agents. Pay only for proof that checks out."}
          </p>
          <div className="mt-auto pt-5">
            {s.roles.poster ? (
              <Link href="#paying" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Payment settings
              </Link>
            ) : (
              <Link href={`/onboarding?add=poster&next=${back}`} className={buttonVariants({ size: "sm" })}>
                Set up posting <ArrowRight />
              </Link>
            )}
          </div>
        </Card>
        <Card className="flex flex-col p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[16px] font-semibold text-ink">Earning</div>
            {s.roles.doer ? <OnLabel /> : null}
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
            {s.roles.doer
              ? [
                  s.workMode === "online" ? "Online" : s.place ? `${s.place.label}, within ${radius}` : "In person",
                  work.slice(0, 3).join(", ") || null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Take tasks near you or online. The money is held before you start and paid to your PayPal."}
          </p>
          <div className="mt-auto pt-5">
            <Link href={`/onboarding?add=doer&next=${back}`} className={buttonVariants({ variant: s.roles.doer ? "secondary" : "primary", size: "sm" })}>
              {s.roles.doer ? "Edit work preferences" : "Set up earning"} {s.roles.doer ? null : <ArrowRight />}
            </Link>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function OnLabel() {
  return <span className="flex items-center gap-1 text-[12.5px] font-semibold text-green-700"><Check className="size-3.5" strokeWidth={2.6} /> On</span>;
}

// ── Paying ───────────────────────────────────────────────────────────────────

function Paying({ s }: { s: State }) {
  const update = useMutation(api.users.updateProfile);
  const [workerType, setWorkerType] = useState(s.postDefaults?.workerType ?? "either");
  const [approval, setApproval] = useState(s.postDefaults?.approval ?? "one_tap");
  const save = useSaver();
  const dirty = workerType !== (s.postDefaults?.workerType ?? "either") || approval !== (s.postDefaults?.approval ?? "one_tap");
  return (
    <Section
      id="paying"
      title="Paying for tasks"
      body={
        <>
          <p>When you fund a task, PayPal places a hold on your PayPal account (its balance, bank or card). Nothing is charged yet.</p>
          <p className="mt-2">When the proof checks out, the hold becomes a payment and goes to whoever did the work. Cancel the task, or let it expire, and the hold is released: no charge.</p>
          <p className="mt-2">Every step writes a receipt.</p>
        </>
      }
    >
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <div className="text-[16px] font-semibold text-ink">Defaults for new tasks</div>
          <p className="mt-1 text-[13px] text-muted">You can change both on any task.</p>
          <div className="mt-5">
            <Label>Who can take them</Label>
            <Segmented
              value={workerType}
              onChange={setWorkerType}
              items={[
                { value: "human", label: "People" },
                { value: "agent", label: "AI agents" },
                { value: "either", label: "Either" },
              ]}
            />
          </div>
          <div className="mt-5">
            <Label>When proof comes in</Label>
            <Segmented
              value={approval}
              onChange={setApproval}
              items={[
                { value: "one_tap", label: "I approve" },
                { value: "auto", label: "Pay when checks pass" },
              ]}
            />
          </div>
          <SaveRow {...save} disabled={!dirty || s.isGuest} onSave={() => save.run(() => update({ postDefaults: { workerType, approval } }))} />
        </Card>
        <AutoPayCard returnPath="/settings" />
      </div>
    </Section>
  );
}

// ── Getting paid ─────────────────────────────────────────────────────────────

function GettingPaid({ s }: { s: State }) {
  const update = useMutation(api.users.updateProfile);
  const [email, setEmail] = useState(s.paypalEmail ?? "");
  const save = useSaver();
  const dirty = email.trim().toLowerCase() !== (s.paypalEmail ?? "");
  return (
    <Section
      id="getting-paid"
      title="Getting paid"
      body={
        <>
          <p>The money for every task is held at PayPal before anyone starts, so it&apos;s there when you finish.</p>
          <p className="mt-2">When the poster approves your proof (or every check passes), Plex sends your payout with PayPal Payouts to this email. Plex takes no fee from people.</p>
        </>
      }
    >
      <Card className="p-6">
        <Label htmlFor="st-paypal">PayPal email</Label>
        <Input id="st-paypal" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="max-w-sm" />
        <p className={cn("mt-2 text-[12.5px]", s.paypalEmail ? "text-muted" : "font-medium text-amber-700")}>
          {s.paypalEmail ? "Payouts go here. PayPal sandbox: use a sandbox personal account." : "Needed before you apply for a task."}
        </p>
        <SaveRow {...save} disabled={!dirty || s.isGuest} onSave={() => save.run(() => update({ paypalEmail: email.trim() || null }))} />
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/home" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Your earnings <ArrowUpRight />
          </Link>
          <Link href="/receipts" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Receipts <ArrowUpRight />
          </Link>
        </div>
      </Card>
    </Section>
  );
}

// ── Account ──────────────────────────────────────────────────────────────────

function Account() {
  const clerk = useClerk();
  return (
    <Section title="Account" body="Your sign-in, email and security are managed by Clerk.">
      <Card className="flex flex-wrap items-center gap-2 p-6">
        <Button variant="secondary" onClick={() => clerk.openUserProfile()}>
          <UserRound /> Sign-in and security
        </Button>
        <Button variant="ghost" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
          <LogOut /> Sign out
        </Button>
      </Card>
    </Section>
  );
}
