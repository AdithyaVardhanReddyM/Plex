"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, Check, Clock, MapPin, ShieldCheck, Star, Undo2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { AiAgentIcon } from "@/components/ui/icons";
import { Amount } from "@/components/ui/money";
import { faceUrl } from "@/components/ui/primitives";
import { cn, formatCents } from "@/lib/utils";

/**
 * The product panels on the right of onboarding's posting steps: the Task
 * Writer turning a line into a task, who does the work, how a hold becomes a
 * payment, and Auto-pay's limits. Plain product UI on the canvas, each with
 * one thing happening.
 */

function useLoop(phases: number[], run = true) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (reduced || !run) return;
    const t = setTimeout(() => setPhase((p) => (p + 1) % phases.length), phases[phase]);
    return () => clearTimeout(t);
  }, [phase, phases, reduced, run]);
  return reduced ? phases.length - 1 : phase;
}

const ease = [0.22, 1, 0.36, 1] as const;

// ── Task Writer ──────────────────────────────────────────────────────────────

const BRIEF = "Is the café on 5th quiet enough to work from this afternoon? $25";
const WRITER_PHASES = [3400, 1300, 4200];

function useTyped(text: string, active: boolean) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced) return;
    const t = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), 42);
    return () => {
      clearInterval(t);
      setN(0);
    };
  }, [active, text, reduced]);
  return reduced ? text : text.slice(0, n);
}

export function WriterArt() {
  const phase = useLoop(WRITER_PHASES);
  const typed = useTyped(BRIEF, phase === 0);
  const shown = phase === 0 ? typed : BRIEF;
  return (
    <div className="flex w-full max-w-[440px] flex-col gap-4">
      <div className="rounded-[18px] bg-surface p-5 shadow-float">
        <div className="text-[12.5px] font-medium text-muted">What do you need done?</div>
        <div className="mt-2 min-h-[48px] text-[15px] leading-relaxed text-ink">
          {shown}
          {phase === 0 ? <span className="ml-px inline-block h-[17px] w-[2px] translate-y-[3px] animate-pulse bg-ink" /> : null}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-[12.5px] text-muted">
          {phase === 1 ? (
            <>
              <AiAgentIcon className="size-4 text-green-700" strokeWidth={1.9} /> Task Writer is writing it up…
            </>
          ) : (
            <span className="rounded-full bg-ink px-3 py-1 text-[12.5px] font-medium text-white">Write it up</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {phase === 2 ? (
          <motion.div
            key="card"
            className="rounded-[18px] bg-surface p-5 shadow-float"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5, ease }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Check how quiet Café Lumen is</div>
                <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                  <MapPin className="size-3.5" strokeWidth={1.9} /> 5th St · Today, 2–5pm
                </div>
              </div>
              <div className="text-right">
                <Amount cents={2500} size="lg" />
                <div className="mt-0.5 text-[11.5px] font-medium text-steel-700">Held at PayPal</div>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {["A photo of the seating, with today's code", "Noise level, quiet / some / loud", "Free outlets near a table"].map((p, i) => (
                <motion.div
                  key={p}
                  className="flex items-center gap-2.5 text-[13.5px] text-ink-2"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.12, duration: 0.35, ease }}
                >
                  <Camera className="size-[18px] flex-none text-green-700" strokeWidth={1.9} />
                  {p}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ── Who does the work ────────────────────────────────────────────────────────

const PEOPLE = [
  { name: "Rosa Delgado", what: "Errands · Mission", rating: "4.9" },
  { name: "Jonah Brooks", what: "Local checks · SoMa", rating: "4.8" },
  { name: "Priya Nair", what: "Research · Remote", rating: "5.0" },
  { name: "Maya Chen", what: "Design · Remote", rating: "4.9" },
  { name: "Leo Park", what: "Hands-on help · Oakland", rating: "4.7" },
];
const AGENTS = [
  { name: "Scout", what: "Finds and compares, about 2 minutes" },
  { name: "Quill", what: "Writes and edits copy" },
  { name: "Tally", what: "Cleans up spreadsheets" },
  { name: "Atlas", what: "Tests your site, files bugs" },
];
const TASKS = [
  { title: "Pick up a print order", cents: 1800 },
  { title: "Compare 5 coworking spaces", cents: 3000 },
  { title: "Photograph a storefront", cents: 1500 },
  { title: "Proofread a landing page", cents: 2200 },
  { title: "Check if a park is open", cents: 1200 },
];

function Marquee({ children, reverse, seconds }: { children: React.ReactNode; reverse?: boolean; seconds: number }) {
  const reduced = useReducedMotion();
  return (
    <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <motion.div
        className="flex w-max gap-3"
        animate={reduced ? undefined : { x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: seconds, ease: "linear", repeat: Infinity }}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}

export function PeopleArt({ highlight }: { highlight?: "human" | "agent" | "either" }) {
  const dimPeople = highlight === "agent";
  const dimAgents = highlight === "human";
  return (
    <div className="flex w-full flex-col gap-3">
      <div className={cn("transition-opacity duration-500", dimPeople && "opacity-35")}>
        <Marquee seconds={38}>
          {PEOPLE.map((p) => (
            <div key={p.name} className="flex flex-none items-center gap-3 rounded-[16px] bg-surface py-3 pr-5 pl-3 shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faceUrl(p.name)} alt="" className="size-10 rounded-full" />
              <div>
                <div className="text-[13.5px] font-semibold text-ink">{p.name}</div>
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                  {p.what} <Star className="size-3 fill-current text-ink-2" strokeWidth={0} /> {p.rating}
                </div>
              </div>
            </div>
          ))}
        </Marquee>
      </div>
      <div className={cn("transition-opacity duration-500", dimAgents && "opacity-35")}>
        <Marquee seconds={32} reverse>
          {AGENTS.map((a) => (
            <div key={a.name} className="flex flex-none items-center gap-3 rounded-[16px] bg-surface py-3 pr-5 pl-4 shadow-card">
              <AiAgentIcon className="size-5 text-green-700" strokeWidth={1.9} />
              <div>
                <div className="text-[13.5px] font-semibold text-ink">{a.name}</div>
                <div className="text-[12px] text-muted">{a.what}</div>
              </div>
            </div>
          ))}
        </Marquee>
      </div>
      <Marquee seconds={44}>
        {TASKS.map((t) => (
          <div key={t.title} className="flex flex-none items-center gap-4 rounded-[16px] bg-surface px-4 py-3 shadow-card">
            <span className="text-[13.5px] font-medium text-ink">{t.title}</span>
            <span className="tabular text-[13px] font-semibold text-steel-700">{formatCents(t.cents)}</span>
          </div>
        ))}
      </Marquee>
    </div>
  );
}

// ── Hold → proof → paid ──────────────────────────────────────────────────────

const HOLD_PHASES = [2400, 2400, 3200];

export function HoldArt() {
  const phase = useLoop(HOLD_PHASES);
  const steps = [
    { label: "Held at PayPal", note: "Your PayPal approves a hold. Nothing is charged.", tone: "text-steel-700" },
    { label: "Proof checked", note: "Photos, code and timestamps match the task.", tone: "text-ink" },
    { label: "Paid to Rosa", note: "Charged now, sent to Rosa's PayPal. Receipt saved.", tone: "text-green-700" },
  ];
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-4">
      <div className="rounded-[20px] bg-surface p-6 shadow-float">
        <div className="text-[13px] font-medium text-muted">Pick up a print order</div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <Amount cents={4000} size="xl" className={cn("transition-colors duration-500", phase === 2 ? "text-green-800" : "text-steel-900")} />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={phase}
              className={cn("pb-1 text-[13px] font-semibold", steps[phase]!.tone)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease }}
            >
              {steps[phase]!.label}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="mt-6 space-y-4">
          {steps.map((s, i) => (
            <div key={s.label} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-5 flex-none items-center justify-center rounded-full transition-colors duration-500",
                  i <= phase ? (i === 2 ? "bg-green-300 text-ink" : "bg-ink text-white") : "bg-sunken text-transparent",
                )}
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <div className={cn("transition-opacity duration-500", i <= phase ? "opacity-100" : "opacity-40")}>
                <div className="text-[13.5px] font-semibold text-ink">{s.label}</div>
                <div className="text-[12.5px] leading-snug text-muted">{s.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-[16px] bg-surface/80 px-5 py-4 shadow-card">
        <Undo2 className="size-[18px] flex-none text-steel-700" strokeWidth={1.9} />
        <div className="text-[13px] leading-snug text-ink-2">
          <span className="font-semibold text-ink">Cancelled, or nobody took it?</span> The hold is released. $0 charged.
        </div>
      </div>
    </div>
  );
}

// ── Auto-pay ─────────────────────────────────────────────────────────────────

const AUTOPAY_PHASES = [2600, 2600, 2600];

export function AutopayArt() {
  const phase = useLoop(AUTOPAY_PHASES);
  const used = [1800, 3000, 4500][phase]!;
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-4">
      <div className="rounded-[20px] bg-surface p-6 shadow-float">
        <div className="flex items-center gap-2 text-[13px] font-medium text-steel-700">
          <Wallet className="size-[18px]" strokeWidth={1.9} /> Auto-pay
        </div>
        <div className="mt-5 flex items-end justify-between">
          <Amount cents={used} size="xl" className="text-steel-900" />
          <span className="tabular pb-1 text-[12.5px] font-medium text-muted">of $150 today</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
          <motion.div className="h-full rounded-full" style={{ background: "var(--meter-steel)" }} animate={{ width: `${(used / 15000) * 100}%` }} transition={{ duration: 0.8, ease }} />
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-steel-700">
          <ShieldCheck className="size-4" strokeWidth={1.9} /> Up to $50 a task, $150 a day
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-[16px] bg-surface/80 px-5 py-4 shadow-card">
        <Clock className="size-[18px] flex-none text-ink-2" strokeWidth={1.9} />
        <div className="text-[13px] leading-snug text-ink-2">
          <span className="font-semibold text-ink">Over a limit?</span> PayPal asks you first, as usual.
        </div>
      </div>
    </div>
  );
}

// ── Profile ──────────────────────────────────────────────────────────────────

export function ProfileCard({
  name,
  avatarUrl,
  place,
  interests,
  bio,
  languages,
}: {
  name: string;
  avatarUrl?: string;
  place?: string;
  interests: string[];
  bio?: string;
  languages?: string[];
}) {
  return (
    <motion.div layout className="w-full max-w-[400px] rounded-[22px] bg-surface p-6 shadow-float" transition={{ duration: 0.4, ease }}>
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl ?? faceUrl(name)} alt="" className="size-16 rounded-full object-cover" />
        <div className="min-w-0">
          <div className="truncate font-display text-[22px] font-bold tracking-[-0.03em] text-ink">{name || "Your name"}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <MapPin className="size-3.5" strokeWidth={1.9} /> {place || "Online"}
          </div>
        </div>
      </div>
      <p className="mt-5 min-h-[44px] text-[14px] leading-relaxed text-ink-2">{bio || "Your profile line goes here."}</p>
      {interests.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {interests.slice(0, 6).map((i) => (
            <span key={i} className="rounded-full bg-sunken px-2.5 py-1 text-[12px] font-medium text-ink-2">
              {i}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-5 flex items-center justify-between text-[12.5px] text-muted">
        <span>{languages?.length ? languages.slice(0, 3).join(", ") : "New on Plex"}</span>
        <span className="font-medium text-green-700">Taking tasks</span>
      </div>
    </motion.div>
  );
}
