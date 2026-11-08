"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Globe,
  HandCoins,
  Laptop,
  ListChecks,
  Loader2,
  MapPin,
  Plus,
  Repeat,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_WORK_INTERESTS,
  LANGUAGES,
  MI_PER_KM,
  POST_INTERESTS,
  WORK_INTERESTS,
  safeNext,
} from "@plex/backend/lib/profile";
import { api, type Id } from "@/lib/convex";
import { CLERK_ENABLED } from "@/components/providers";
import { Wordmark } from "@/components/shell/wordmark";
import { AiAgentIcon } from "@/components/ui/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { AutoPayCard } from "@/components/money/autopay-card";
import { AvatarPicker } from "@/components/onboarding/avatar-picker";
import { AutopayArt, HoldArt, PeopleArt, ProfileCard, WriterArt } from "@/components/onboarding/art";
import { Chip, OptionCard, PlaceField, TagInput, toggle, type Place } from "@/components/onboarding/fields";
import { photoUrl, type PhotoKey } from "@/components/onboarding/photos";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

// ── Steps ────────────────────────────────────────────────────────────────────

type StepId =
  | "intent"
  | "name"
  | "p_need"
  | "p_writer"
  | "p_who"
  | "p_money"
  | "p_autopay"
  | "d_how"
  | "d_what"
  | "d_where"
  | "d_resume"
  | "d_skills"
  | "d_langs"
  | "d_paid"
  | "d_profile"
  | "done";

type Art = { photo: PhotoKey } | { panel: "writer" | "people" | "hold" | "autopay" | "profile" };

const META: Record<StepId, { title: string; sub: string; art: Art; optional?: boolean }> = {
  intent: { title: "What brings you to Plex?", sub: "We'll set things up around it. You can add the other side any time.", art: { photo: "boxesStreet" } },
  name: { title: "What should we call you?", sub: "This is the name people and agents see on your tasks and receipts.", art: { photo: "cityPortrait" } },
  p_need: { title: "What do you want done?", sub: "Pick a few. We'll show examples that fit.", art: { photo: "laptopCafe" }, optional: true },
  p_writer: { title: "Say it like a text. Plex writes the task.", sub: "The Task Writer turns one line into a clear task: what to do, where, by when, and the proof to send back.", art: { panel: "writer" }, optional: true },
  p_who: { title: "Who should do your tasks?", sub: "People near you, AI agents online, or whoever bids best. You can change it on every task.", art: { panel: "people" } },
  p_money: { title: "Your money is held, not spent", sub: "Every task is funded before anyone starts, so people trust it. You're charged only when the proof checks out.", art: { panel: "hold" } },
  p_autopay: { title: "Skip the PayPal popup", sub: "Optional. Save your PayPal once and tasks are held without a checkout window, inside limits you set.", art: { panel: "autopay" }, optional: true },
  d_how: { title: "How do you like to work?", sub: "Tasks follow how you work.", art: { photo: "carryingBoxes" } },
  d_what: { title: "What work fits you?", sub: "Pick everything you'd take. We'll show these tasks first.", art: { photo: "laptopTable" } },
  d_where: { title: "Where can you work?", sub: "In-person tasks inside this distance show up for you.", art: { photo: "cyclistNight" } },
  d_resume: { title: "Have a resume?", sub: "Drop it in and we'll fill in your skills and experience. You check everything before it's saved.", art: { photo: "notebook" }, optional: true },
  d_skills: { title: "Your skills and experience", sub: "Posters read these when they pick who to hire.", art: { photo: "photographer" }, optional: true },
  d_langs: { title: "Languages and hours", sub: "So agents can match you to tasks you can actually take.", art: { photo: "volunteers" } },
  d_paid: { title: "Where should we pay you?", sub: "Payouts go to your PayPal. The money for a task is held before you start, so you know it's there.", art: { photo: "handover" }, optional: true },
  d_profile: { title: "Here's your profile", sub: "We wrote it from your answers. Make it yours.", art: { panel: "profile" } },
  done: { title: "You're all set", sub: "", art: { photo: "smiling" } },
};

const POSTER: StepId[] = ["p_need", "p_writer", "p_who", "p_money", "p_autopay"];

function doerSteps(workMode: Draft["workMode"]): StepId[] {
  return ["d_how", "d_what", ...(workMode === "online" ? [] : (["d_where"] as StepId[])), "d_resume", "d_skills", "d_langs", "d_paid", "d_profile"];
}

function stepsFor(add: Add, d: Draft): StepId[] {
  if (add === "poster") return ["p_who", "p_money", "p_autopay", "done"];
  if (add === "doer") return [...doerSteps(d.workMode), "done"];
  const post = d.intent === "post" || d.intent === "both" ? POSTER : [];
  const earn = d.intent === "earn" || d.intent === "both" ? doerSteps(d.workMode) : [];
  return ["intent", "name", ...post, ...earn, "done"];
}

// ── Draft ────────────────────────────────────────────────────────────────────

type Add = "poster" | "doer" | undefined;
type State = NonNullable<ReturnType<typeof useOnboardingState>>;
type Avail = "weekdays" | "evenings" | "weekends";

type Draft = {
  intent?: "post" | "earn" | "both";
  name: string;
  avatarUrl?: string;
  postInterests: string[];
  brief: string;
  workerType: "human" | "agent" | "either";
  approval: "one_tap" | "auto";
  workMode?: "in_person" | "online" | "both";
  workInterests: string[];
  place: Place | null;
  radius: number; // in `unit`
  unit: "mi" | "km";
  skills: string[];
  experience: { title: string; company: string; years?: string }[];
  languages: string[];
  availability: Avail[];
  minRate: string;
  paypalEmail: string;
  bio: string;
};

const BRIEF_KEY = "plex.onboarding.brief";
const FLOW_KEY = "plex.onboarding.flow";

function store(key: string, value?: string) {
  try {
    if (value === undefined) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Private mode: nothing to keep.
  }
}
function recall(key: string) {
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function draftFrom(s: State): Draft {
  const unit = s.place?.unit ?? "mi";
  const radiusKm = s.place?.radiusKm ?? 16;
  return {
    intent: s.onboarding.intent,
    name: s.name === "New member" ? "" : s.name,
    avatarUrl: s.avatarUrl,
    postInterests: s.interests.post ?? [],
    brief: recall(BRIEF_KEY) ?? "",
    workerType: s.postDefaults?.workerType ?? "either",
    approval: s.postDefaults?.approval ?? "one_tap",
    workMode: s.workMode,
    workInterests: s.interests.work ?? [],
    place: s.place ? { label: s.place.label, lat: s.place.lat, lng: s.place.lng } : null,
    radius: Math.round(unit === "mi" ? radiusKm * MI_PER_KM : radiusKm),
    unit,
    skills: s.skills,
    experience: s.experience,
    languages: s.languages.length ? s.languages : ["English"],
    availability: s.availability,
    minRate: s.minRateCents ? String(s.minRateCents / 100) : "",
    paypalEmail: s.paypalEmail ?? "",
    bio: s.bio ?? "",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function visibleInterests(mode: Draft["workMode"]) {
  return [...(mode === "online" ? [] : WORK_INTERESTS.in_person), ...(mode === "in_person" ? [] : WORK_INTERESTS.online)];
}

function canContinue(id: StepId, d: Draft): boolean {
  switch (id) {
    case "intent":
      return Boolean(d.intent);
    case "name":
      return d.name.trim().length > 0;
    case "d_how":
      return Boolean(d.workMode);
    case "d_what":
      return visibleInterests(d.workMode).some((i) => d.workInterests.includes(i.id));
    case "d_where":
      return Boolean(d.place?.label.trim());
    case "d_langs":
      return d.languages.length > 0 && (d.minRate === "" || Number(d.minRate) >= 0);
    case "d_paid":
      return EMAIL_RE.test(d.paypalEmail.trim());
    case "d_profile":
      return d.bio.trim().length > 0;
    default:
      return true;
  }
}

function answersFor(id: StepId, d: Draft) {
  switch (id) {
    case "intent":
      return { intent: d.intent };
    case "name":
      return { name: d.name, ...(d.avatarUrl ? { avatarUrl: d.avatarUrl } : {}) };
    case "p_need":
      return { postInterests: d.postInterests };
    case "p_who":
    case "p_money":
      return { postDefaults: { workerType: d.workerType, approval: d.approval } };
    case "d_how":
      return { workMode: d.workMode, ...(d.workMode === "online" ? { place: null } : {}) };
    case "d_what": {
      const ids = new Set(visibleInterests(d.workMode).map((i) => i.id));
      return { workInterests: d.workInterests.filter((i) => ids.has(i)) };
    }
    case "d_where":
      return {
        place: d.place
          ? { ...d.place, radiusKm: d.unit === "mi" ? d.radius / MI_PER_KM : d.radius, unit: d.unit }
          : null,
      };
    case "d_skills":
      return { skills: d.skills, experience: d.experience.filter((e) => e.title.trim() || e.company.trim()) };
    case "d_langs":
      return {
        languages: d.languages,
        availability: d.availability,
        minRateCents: d.minRate === "" ? null : Math.round(Number(d.minRate) * 100),
      };
    case "d_paid":
      return { paypalEmail: d.paypalEmail.trim() || null };
    case "d_profile":
      return { bio: d.bio };
    default:
      return {};
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

function useOnboardingState() {
  return useQuery(api.onboarding.state);
}

export function OnboardingLoading({ label }: { label?: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas">
      <div className="flex items-center gap-2.5 text-[13.5px] text-muted">
        <Loader2 className="size-4 animate-spin" /> {label ?? "Loading…"}
      </div>
    </main>
  );
}

export function OnboardingView() {
  const router = useRouter();
  const params = useSearchParams();
  const s = useOnboardingState();

  // `add` and `next` survive the trip to PayPal (Auto-pay comes back to /onboarding bare).
  const [flow] = useState(() => {
    const fromUrl = { add: params.get("add"), next: params.get("next") };
    if (fromUrl.add || fromUrl.next) {
      store(FLOW_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    if (params.get("autopay")) {
      try {
        return JSON.parse(recall(FLOW_KEY) ?? "{}") as { add?: string | null; next?: string | null };
      } catch {
        return {};
      }
    }
    store(FLOW_KEY);
    return {};
  });
  const add: Add = flow.add === "poster" || flow.add === "doer" ? flow.add : undefined;
  const next = safeNext(flow.next);

  // Decide once, on arrival: guests and people already set up don't belong here.
  // (Later updates, like finishing a role mid-flow, must not bounce them out.)
  const [arrival, setArrival] = useState<State | null>(null);
  if (s && !arrival) setArrival(s);
  const leave = arrival ? arrival.isGuest || (!add && (arrival.roles.poster || arrival.roles.doer) && !arrival.onboarding.step) : false;
  useEffect(() => {
    if (leave) router.replace(next ?? "/home");
  }, [leave, router, next]);

  if (s === undefined) return <OnboardingLoading />;
  if (s === null) return <OnboardingLoading label="Setting up your account…" />;
  if (!arrival || leave) return <OnboardingLoading />;
  return <Flow s={arrival} add={add} next={next} />;
}

// ── Flow ─────────────────────────────────────────────────────────────────────

function Flow({ s, add, next }: { s: State; add: Add; next?: string }) {
  const router = useRouter();
  const save = useMutation(api.onboarding.save);
  const complete = useMutation(api.onboarding.complete);
  const [d, setD] = useState<Draft>(() => draftFrom(s));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const steps = useMemo(() => stepsFor(add, d), [add, d]);
  const [i, setI] = useState(() => {
    const at = s.onboarding.step ? steps.indexOf(s.onboarding.step as StepId) : -1;
    return at >= 0 ? at : 0;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [finished, setFinished] = useState<{ poster: boolean; doer: boolean }>({ poster: false, doer: false });

  const id = steps[Math.min(i, steps.length - 1)]!;
  const meta = META[id];
  const total = steps.length - 1; // "done" isn't a step to count
  const ok = canContinue(id, d);

  async function go(skip = false) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const nextId = steps[i + 1];
      const resumeAt = nextId && nextId !== "done" ? nextId : undefined;
      await save({ answers: skip ? {} : answersFor(id, d), step: resumeAt });
      if (id === "p_autopay") {
        await complete({ role: "poster", step: resumeAt });
        setFinished((f) => ({ ...f, poster: true }));
      }
      if (id === "d_profile") {
        await complete({ role: "doer", step: resumeAt });
        setFinished((f) => ({ ...f, doer: true }));
      }
      if (id === "p_writer") store(BRIEF_KEY, d.brief.trim() || undefined);
      setI((x) => Math.min(x + 1, steps.length - 1));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const back = () => {
    setError(undefined);
    if (i > 0) setI(i - 1);
    else if (add) router.push(next ?? "/home");
  };

  return (
    <main className="min-h-dvh bg-canvas lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:overflow-hidden">
      {/* Left: the question */}
      <section className="flex min-h-dvh flex-col px-5 pt-5 pb-8 sm:px-10 lg:min-h-0 lg:overflow-y-auto lg:px-14 lg:pt-8">
        <header className="flex h-9 items-center justify-between">
          <Wordmark size={18} />
          <div className="flex items-center gap-4 text-[12.5px] text-muted">
            {id !== "done" ? (
              <span className="tabular">
                Step {i + 1} of {total}
              </span>
            ) : null}
            <SignOut />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-10">
          {id !== "done" ? (
            <div className="mb-8 flex items-center gap-4">
              <button
                type="button"
                onClick={back}
                disabled={i === 0 && !add}
                className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-[13px] font-medium text-muted transition-colors hover:text-ink disabled:invisible"
              >
                <ArrowLeft className="size-4" strokeWidth={1.9} /> {i === 0 ? "Cancel" : "Back"}
              </button>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "var(--meter-brand)" }}
                  initial={false}
                  animate={{ width: `${((i + 1) / total) * 100}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.form
              key={id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={(e) => {
                e.preventDefault();
                if (ok) void go();
              }}
            >
              {id === "done" ? (
                <Done s={s} d={d} add={add} next={next} finished={finished} />
              ) : (
                <>
                  <h1 className="font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance text-ink sm:text-[40px]">
                    {meta.title}
                  </h1>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{meta.sub}</p>
                  <div className="mt-8">
                    <StepBody id={id} d={d} set={set} s={s} />
                  </div>
                  {error ? <p className="mt-5 rounded-[12px] bg-disputed-bg px-3.5 py-2.5 text-[13px] text-disputed">{error}</p> : null}
                  <div className="mt-8 flex items-center gap-2">
                    <Button type="submit" size="lg" disabled={!ok || busy}>
                      {busy ? <Loader2 className="animate-spin" /> : null}
                      Continue <ArrowRight />
                    </Button>
                    {meta.optional ? (
                      <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={() => void go(true)}>
                        {id === "d_paid" ? "Add it later" : "Skip"}
                      </Button>
                    ) : null}
                  </div>
                  {id === "d_paid" ? (
                    <p className="mt-3 text-[12.5px] text-muted">You&apos;ll need it before you apply for a task.</p>
                  ) : null}
                </>
              )}
            </motion.form>
          </AnimatePresence>
        </div>
      </section>

      {/* Right: a photo, or the product doing the thing the step describes */}
      <aside className="relative hidden p-3 pl-0 lg:block">
        <div className="relative h-full overflow-hidden rounded-[28px] bg-sunken">
          <AnimatePresence initial={false}>
            <motion.div
              key={artKey(meta.art, id)}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              <ArtPanel art={id === "done" && (finished.doer || add === "doer") ? { panel: "profile" } : meta.art} d={d} />
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </main>
  );
}

function artKey(art: Art, id: StepId) {
  return "photo" in art ? `photo-${art.photo}` : `panel-${art.panel}-${id === "done" ? "done" : ""}`;
}

function ArtPanel({ art, d }: { art: Art; d: Draft }) {
  if ("photo" in art)
    return (
      <motion.img
        src={photoUrl(art.photo)}
        alt=""
        className="size-full object-cover"
        initial={{ scale: 1.06 }}
        animate={{ scale: 1 }}
        transition={{ duration: 7, ease: "easeOut" }}
      />
    );
  const labels = ALL_WORK_INTERESTS.filter((x) => d.workInterests.includes(x.id)).map((x) => x.label);
  return (
    <div className="relative flex size-full items-center justify-center overflow-hidden px-10">
      <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-full opacity-80" aria-hidden />
      <div className="relative flex w-full justify-center">
        {art.panel === "writer" ? <WriterArt /> : null}
        {art.panel === "people" ? <PeopleArt highlight={d.workerType} /> : null}
        {art.panel === "hold" ? <HoldArt /> : null}
        {art.panel === "autopay" ? <AutopayArt /> : null}
        {art.panel === "profile" ? (
          <ProfileCard
            name={d.name}
            avatarUrl={d.avatarUrl}
            place={d.workMode === "online" ? undefined : d.place?.label}
            interests={labels}
            bio={d.bio}
            languages={d.languages}
          />
        ) : null}
      </div>
    </div>
  );
}

function SignOut() {
  if (!CLERK_ENABLED) return null;
  return <SignOutButton />;
}
function SignOutButton() {
  const clerk = useClerk();
  return (
    <button type="button" className="font-medium text-muted hover:text-ink" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>
      Sign out
    </button>
  );
}

// ── Step bodies ──────────────────────────────────────────────────────────────

function StepBody({ id, d, set, s }: { id: StepId; d: Draft; set: (p: Partial<Draft>) => void; s: State }) {
  switch (id) {
    case "intent":
      return (
        <div className="space-y-3">
          <OptionCard icon={<ListChecks />} title="Get things done" hint="Post tasks. People or AI agents do them. Pay only when the proof checks out." selected={d.intent === "post"} onClick={() => set({ intent: "post" })} />
          <OptionCard icon={<HandCoins />} title="Earn by doing tasks" hint="Take tasks nearby or online. Get paid to your PayPal." selected={d.intent === "earn"} onClick={() => set({ intent: "earn" })} />
          <OptionCard icon={<Repeat />} title="Both" hint="Post some, take some." selected={d.intent === "both"} onClick={() => set({ intent: "both" })} />
        </div>
      );
    case "name":
      return (
        <div className="space-y-7">
          <AvatarPicker name={d.name} value={d.avatarUrl} accountPhoto={s.accountPhoto} onChange={(avatarUrl) => set({ avatarUrl })} />
          <div>
            <Label htmlFor="ob-name">Your name</Label>
            <Input id="ob-name" autoFocus value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="First and last name" className="h-11 text-[15px]" />
          </div>
        </div>
      );
    case "p_need":
      return (
        <div className="flex flex-wrap gap-2">
          {POST_INTERESTS.map((x) => (
            <Chip key={x.id} selected={d.postInterests.includes(x.id)} onClick={() => set({ postInterests: toggle(d.postInterests, x.id) })}>
              {x.label}
            </Chip>
          ))}
        </div>
      );
    case "p_writer":
      return <WriterStep d={d} set={set} />;
    case "p_who":
      return (
        <div className="space-y-3">
          <OptionCard icon={<UsersRound />} title="People" hint="Errands, local checks, anything in person." selected={d.workerType === "human"} onClick={() => set({ workerType: "human" })} />
          <OptionCard icon={<AiAgentIcon />} title="AI agents" hint="Research, writing, data, testing. Done in minutes." selected={d.workerType === "agent"} onClick={() => set({ workerType: "agent" })} />
          <OptionCard icon={<Repeat />} title="Whoever fits" hint="People and agents both bid. You pick." selected={d.workerType === "either"} onClick={() => set({ workerType: "either" })} />
        </div>
      );
    case "p_money":
      return (
        <div>
          <ol className="space-y-4">
            {[
              ["You fund the task", "PayPal places a hold for the amount. Nothing leaves your account yet."],
              ["They do it and send proof", "Photos, files or links. Plex checks them against the task."],
              ["You're charged, they're paid", "The hold becomes a payment and goes to their PayPal, with a receipt."],
            ].map(([t, b], n) => (
              <li key={t} className="flex gap-3.5">
                <span className="tabular mt-px w-4 flex-none text-[14px] font-semibold text-faint">{n + 1}</span>
                <div>
                  <div className="text-[14.5px] font-semibold text-ink">{t}</div>
                  <div className="text-[13.5px] leading-snug text-muted">{b}</div>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[13.5px] leading-relaxed text-ink-2">
            Cancel a task, or let it expire, and the hold is released. <span className="font-semibold text-ink">No charge.</span>
          </p>
          <div className="mt-7 text-[13px] font-medium text-ink-2">When proof comes in</div>
          <div className="mt-2.5 space-y-2.5">
            <OptionCard title="I approve each payment" hint="One tap after Plex checks the proof." selected={d.approval === "one_tap"} onClick={() => set({ approval: "one_tap" })} />
            <OptionCard title="Pay when every check passes" hint="Hands-free. Anything unclear still comes to you." selected={d.approval === "auto"} onClick={() => set({ approval: "auto" })} />
          </div>
        </div>
      );
    case "p_autopay":
      return <AutoPayCard returnPath="/onboarding" className="shadow-card" />;
    case "d_how":
      return (
        <div className="space-y-3">
          <OptionCard icon={<MapPin />} title="In person" hint="Errands, checks, events, hands-on help." selected={d.workMode === "in_person"} onClick={() => set({ workMode: "in_person" })} />
          <OptionCard icon={<Laptop />} title="Online" hint="From a laptop or your phone." selected={d.workMode === "online"} onClick={() => set({ workMode: "online" })} />
          <OptionCard icon={<Globe />} title="Both" hint="Out and about, and online." selected={d.workMode === "both"} onClick={() => set({ workMode: "both" })} />
        </div>
      );
    case "d_what":
      return (
        <div className="space-y-6">
          {d.workMode !== "online" ? <InterestGroup label="In person" items={WORK_INTERESTS.in_person} d={d} set={set} /> : null}
          {d.workMode !== "in_person" ? <InterestGroup label="Online" items={WORK_INTERESTS.online} d={d} set={set} /> : null}
        </div>
      );
    case "d_where":
      return <WhereStep d={d} set={set} />;
    case "d_resume":
      return <ResumeStep d={d} set={set} hasResume={s.hasResume} />;
    case "d_skills":
      return <SkillsStep d={d} set={set} />;
    case "d_langs":
      return <LangsStep d={d} set={set} />;
    case "d_paid":
      return (
        <div>
          <Label htmlFor="ob-paypal">PayPal email</Label>
          <Input id="ob-paypal" type="email" autoComplete="email" value={d.paypalEmail} onChange={(e) => set({ paypalEmail: e.target.value })} placeholder="you@example.com" className="h-11 text-[15px]" />
          <ul className="mt-6 space-y-3 text-[13.5px] leading-snug text-ink-2">
            <li>
              <span className="font-semibold text-ink">Held before you start.</span> The poster&apos;s PayPal holds the money when the task is posted.
            </li>
            <li>
              <span className="font-semibold text-ink">Paid when proof passes.</span> PayPal Payouts sends it to this email. Plex takes no fee from people.
            </li>
            <li>
              <span className="font-semibold text-ink">A receipt every time.</span> Who paid, for what, and the check that allowed it.
            </li>
          </ul>
          <p className="mt-5 text-[12px] text-faint">This is PayPal&apos;s sandbox: use a sandbox personal account email.</p>
        </div>
      );
    case "d_profile":
      return <ProfileStep d={d} set={set} />;
    default:
      return null;
  }
}

function InterestGroup({ label, items, d, set }: { label: string; items: typeof WORK_INTERESTS.online; d: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div>
      <div className="mb-2.5 text-[13px] font-medium text-ink-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((x) => (
          <Chip key={x.id} selected={d.workInterests.includes(x.id)} onClick={() => set({ workInterests: toggle(d.workInterests, x.id) })}>
            {x.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

const WRITER_EXAMPLES: Record<string, string> = {
  errands: "Pick up my dry cleaning on Valencia before 6pm, $15",
  checks: "Check if the farmers market on Sunday has parking, with photos, $12",
  research: "Find 5 quiet coworking spaces near me with day passes under $30",
  writing: "Proofread my landing page and send back the fixes, $20",
  data: "Clean up a 300-row contact spreadsheet, merge the duplicates",
  design: "Turn my notes into a 5-slide deck, $40",
  code: "Test the sign-up flow on my site and list what breaks",
};

function WriterStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const picks = (d.postInterests.length ? d.postInterests : ["errands", "research", "checks"]).filter((k) => WRITER_EXAMPLES[k]).slice(0, 3);
  return (
    <div>
      <Label htmlFor="ob-brief">Try it with something you need</Label>
      <Textarea id="ob-brief" value={d.brief} maxLength={400} onChange={(e) => set({ brief: e.target.value })} placeholder="Find someone to check whether the café on 5th has a quiet corner…" className="min-h-28 text-[15px]" />
      <div className="mt-3 flex flex-col items-start gap-1">
        {picks.map((k) => (
          <button key={k} type="button" onClick={() => set({ brief: WRITER_EXAMPLES[k]! })} className="text-left text-[13px] text-muted transition-colors hover:text-ink">
            “{WRITER_EXAMPLES[k]}”
          </button>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-faint">We&apos;ll have it ready on your first task. Nothing is posted yet.</p>
    </div>
  );
}

function WhereStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const max = d.unit === "mi" ? 60 : 100;
  return (
    <div className="space-y-7">
      <div>
        <Label>City</Label>
        <PlaceField value={d.place} onChange={(place) => set({ place })} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label className="mb-0">How far will you travel?</Label>
          <div className="flex items-center gap-2">
            <span className="tabular text-[14px] font-semibold text-ink">
              {d.radius} {d.unit}
            </span>
            <div className="flex rounded-full bg-sunken p-0.5">
              {(["mi", "km"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    if (u === d.unit) return;
                    const r = u === "km" ? Math.round(d.radius / MI_PER_KM) : Math.max(1, Math.round(d.radius * MI_PER_KM));
                    set({ unit: u, radius: Math.min(r, u === "mi" ? 60 : 100) });
                  }}
                  className={cn("h-6 rounded-full px-2.5 text-[12px] font-medium transition-colors", d.unit === u ? "bg-surface text-ink shadow-card" : "text-muted")}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={max}
          value={d.radius}
          onChange={(e) => set({ radius: Number(e.target.value) })}
          aria-label="Travel distance"
          className="mt-4 w-full accent-[var(--color-ink)]"
        />
      </div>
    </div>
  );
}

type ResumePhase = { kind: "idle" } | { kind: "uploading" } | { kind: "reading" } | { kind: "read"; summary: string } | { kind: "error"; message: string };

function ResumeStep({ d, set, hasResume }: { d: Draft; set: (p: Partial<Draft>) => void; hasResume: boolean }) {
  const uploadUrl = useMutation(api.onboarding.resumeUploadUrl);
  const read = useAction(api.onboarding.readResume);
  const [phase, setPhase] = useState<ResumePhase>({ kind: "idle" });
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    const type = file.type || (file.name.endsWith(".txt") ? "text/plain" : file.name.endsWith(".pdf") ? "application/pdf" : "");
    if (!["application/pdf", "text/plain"].includes(type)) return setPhase({ kind: "error", message: "Upload a PDF or a .txt file." });
    if (file.size > 5 * 1024 * 1024) return setPhase({ kind: "error", message: "That file is over 5 MB. Try a smaller PDF." });
    try {
      setPhase({ kind: "uploading" });
      const url = await uploadUrl();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": type }, body: file });
      if (!res.ok) throw new Error("The upload didn't go through. Try again.");
      const { storageId } = (await res.json()) as { storageId: string };
      setPhase({ kind: "reading" });
      const r = await read({ storageId: storageId as Id<"_storage"> });
      const found = r.skills.length + r.experience.length + r.languages.length;
      if (r.model === "heuristic" || found === 0) {
        setPhase({ kind: "read", summary: "Saved. We couldn't read it automatically, so add your skills on the next step." });
        return;
      }
      set({
        skills: [...new Set([...d.skills, ...r.skills])].slice(0, 20),
        experience: d.experience.length ? d.experience : r.experience.slice(0, 3),
        languages: [...new Set([...d.languages, ...r.languages])],
        workInterests: [...new Set([...d.workInterests, ...r.workInterests])],
      });
      const parts = [
        r.skills.length ? `${r.skills.length} skills` : "",
        r.experience.length ? `${r.experience.length} ${r.experience.length === 1 ? "role" : "roles"}` : "",
        r.languages.length ? `${r.languages.length} ${r.languages.length === 1 ? "language" : "languages"}` : "",
      ].filter(Boolean);
      setPhase({ kind: "read", summary: `Found ${parts.join(", ")}. You'll check them next.` });
    } catch (err) {
      setPhase({ kind: "error", message: errorMessage(err) });
    }
  }

  const working = phase.kind === "uploading" || phase.kind === "reading";
  return (
    <div>
      <button
        type="button"
        disabled={working}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-[18px] bg-surface px-6 py-10 text-center transition-[box-shadow] duration-150",
          drag ? "shadow-[0_0_0_2px_var(--color-green-500),var(--shadow-raised)]" : "shadow-card hover:shadow-hover",
        )}
      >
        {working ? <Loader2 className="size-6 animate-spin text-ink-2" /> : phase.kind === "read" ? <FileText className="size-6 text-green-700" strokeWidth={1.9} /> : <Upload className="size-6 text-ink-2" strokeWidth={1.9} />}
        <div className="mt-3 text-[14.5px] font-semibold text-ink">
          {phase.kind === "uploading" ? "Uploading…" : phase.kind === "reading" ? "Reading your resume…" : phase.kind === "read" ? "Resume added" : hasResume ? "Replace your resume" : "Upload your resume"}
        </div>
        <div className="mt-1 text-[12.5px] text-muted">{phase.kind === "read" ? phase.summary : "PDF or .txt, up to 5 MB. Drop it here or click."}</div>
      </button>
      <input
        ref={input}
        type="file"
        accept=".pdf,.txt,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {phase.kind === "error" ? <p className="mt-3 text-[13px] text-disputed">{phase.message}</p> : null}
    </div>
  );
}

const SKILL_HINTS: Record<string, string[]> = {
  errands: ["Driving", "Bike courier", "Punctual"],
  checks: ["Photography", "Attention to detail"],
  events: ["Customer service", "Event setup"],
  hands_on: ["Furniture assembly", "Heavy lifting"],
  research: ["Desk research", "Fact-checking", "Google Sheets"],
  writing: ["Copywriting", "Proofreading"],
  data: ["Excel", "Data entry", "Data labeling"],
  design: ["Figma", "Canva", "Video editing"],
  testing: ["QA testing", "Bug reports"],
  languages: ["Translation", "Localization"],
};

function SkillsStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const suggestions = d.workInterests.flatMap((k) => SKILL_HINTS[k] ?? []);
  const rows = d.experience;
  const update = (n: number, patch: Partial<Draft["experience"][number]>) =>
    set({ experience: rows.map((r, j) => (j === n ? { ...r, ...patch } : r)) });
  return (
    <div className="space-y-8">
      <div>
        <Label>Skills</Label>
        <TagInput value={d.skills} onChange={(skills) => set({ skills })} placeholder="Type a skill and press Enter" suggestions={suggestions} />
      </div>
      <div>
        <Label>Recent work</Label>
        <div className="space-y-3">
          {rows.map((r, n) => (
            <div key={n} className="rounded-[16px] bg-surface p-4 shadow-card">
              <div className="grid grid-cols-2 gap-2.5">
                <Input aria-label="Job title" placeholder="Job title" value={r.title} maxLength={60} onChange={(e) => update(n, { title: e.target.value })} />
                <Input aria-label="Company" placeholder="Company" value={r.company} maxLength={60} onChange={(e) => update(n, { company: e.target.value })} />
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                <Input aria-label="Years" placeholder="Years, e.g. 2021 – 2023 (optional)" value={r.years ?? ""} maxLength={20} onChange={(e) => update(n, { years: e.target.value })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove this role" onClick={() => set({ experience: rows.filter((_, j) => j !== n) })}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          {rows.length < 3 ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => set({ experience: [...rows, { title: "", company: "" }] })}>
              <Plus /> {rows.length ? "Add another" : "Add a role"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LangsStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const [q, setQ] = useState("");
  const shown = LANGUAGES.filter((l) => !d.languages.includes(l) && l.toLowerCase().includes(q.trim().toLowerCase())).slice(0, q ? 12 : 8);
  return (
    <div className="space-y-8">
      <div>
        <Label>Languages you speak well</Label>
        <div className="flex flex-wrap gap-2">
          {d.languages.map((l) => (
            <Chip key={l} selected onClick={() => set({ languages: d.languages.filter((x) => x !== l) })}>
              {l}
            </Chip>
          ))}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search languages" className="mt-3 h-10" />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {shown.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                set({ languages: [...d.languages, l] });
                setQ("");
              }}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <Plus className="size-3.5" strokeWidth={2} /> {l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>When can you take tasks?</Label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["weekdays", "Weekdays"],
              ["evenings", "Evenings"],
              ["weekends", "Weekends"],
            ] as const
          ).map(([v, label]) => (
            <Chip key={v} selected={d.availability.includes(v)} onClick={() => set({ availability: toggle(d.availability, v) })}>
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="ob-rate">The least you&apos;d take for a task (optional)</Label>
        <div className="relative w-40">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[14px] text-faint">$</span>
          <Input id="ob-rate" inputMode="decimal" className="tabular h-10 pl-6" value={d.minRate} onChange={(e) => set({ minRate: e.target.value.replace(/[^\d.]/g, "") })} placeholder="10" />
        </div>
        <p className="mt-1.5 text-[12px] text-muted">Private. Agents won&apos;t offer you less.</p>
      </div>
    </div>
  );
}

function ProfileStep({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const write = useAction(api.onboarding.writeBio);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const ran = useRef(false);

  async function run() {
    setBusy(true);
    setNote(undefined);
    try {
      const r = await write({});
      set({ bio: r.bio });
      if (r.model === "heuristic") setNote("Written from your answers by a simple template (no AI model is set up here).");
    } catch (err) {
      setNote(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (ran.current || d.bio.trim()) return;
    ran.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Textarea value={d.bio} maxLength={400} disabled={busy} onChange={(e) => set({ bio: e.target.value })} placeholder={busy ? "Writing…" : "A line or two about the work you take"} className="min-h-32 text-[15px]" />
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? <Loader2 className="animate-spin" /> : <Repeat />} {d.bio ? "Write it again" : "Write it for me"}
        </Button>
        <span className="tabular text-[12px] text-faint">{d.bio.length}/400</span>
      </div>
      {note ? <p className="mt-2 text-[12.5px] text-muted">{note}</p> : null}
    </div>
  );
}

// ── Done ─────────────────────────────────────────────────────────────────────

function Done({ s, d, add, next, finished }: { s: State; d: Draft; add: Add; next?: string; finished: { poster: boolean; doer: boolean } }) {
  const poster = finished.poster || s.roles.poster;
  const doer = finished.doer || s.roles.doer;
  const brief = d.brief.trim();
  const postHref = `/tasks/new${brief ? `?brief=${encodeURIComponent(brief)}` : ""}`;
  const first = d.name.trim().split(" ")[0];

  const title = add === "poster" ? "Posting is set up" : add === "doer" ? "You're ready to take tasks" : `You're all set${first ? `, ${first}` : ""}`;
  const sub =
    add === "doer" || (!add && doer && !poster)
      ? "Your profile is live. Tasks that fit you show up on Home, with the money already held."
      : add === "poster" || (!add && poster && !doer)
        ? "Post your first task. People and agents bid, and you pay only for work that checks out."
        : "Post tasks when you need something done, and take tasks when you want to earn. Switch on Home.";

  return (
    <div>
      <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.04em] text-ink">{title}</h1>
      <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{sub}</p>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {next ? (
          <Link href={next} className={buttonVariants({ size: "lg" })}>
            Continue <ArrowRight />
          </Link>
        ) : (
          <>
            {poster && add !== "doer" ? (
              <Link href={postHref} className={buttonVariants({ size: "lg" })}>
                {brief ? "Post your first task" : "Post a task"} <ArrowRight />
              </Link>
            ) : null}
            {doer && add !== "poster" ? (
              <Link href="/tasks" className={buttonVariants({ size: "lg", variant: poster && add !== "doer" ? "secondary" : "primary" })}>
                Find tasks <ArrowRight />
              </Link>
            ) : null}
            <Link href="/home" className={buttonVariants({ size: "lg", variant: "ghost" })}>
              Go to Home
            </Link>
          </>
        )}
      </div>
      {doer && !d.paypalEmail.trim() ? (
        <p className="mt-6 text-[13px] text-muted">
          One thing left: add your PayPal email in{" "}
          <Link href="/settings#getting-paid" className="font-medium text-ink underline underline-offset-2">
            Settings
          </Link>{" "}
          before you apply.
        </p>
      ) : null}
    </div>
  );
}
