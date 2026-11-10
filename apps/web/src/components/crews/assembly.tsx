"use client";

import { Panel, ViewportPortal } from "@xyflow/react";
import { AnimatePresence, animate, motion, motionValue, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { CanvasStep } from "./canvas";

/**
 * The crew assembling itself: a cursor per agent (Figma-style), moving on
 * curved paths. The Planner places each step, every agent flies in to claim
 * its own, drags the connections from the steps it builds on, and the Builder
 * waits on any step whose agent is still being made. Purely visual: the crew
 * is already planned; this shows who does what, and in what order.
 */

export type Show = { placed: Set<string>; claimed: Set<string>; edges: Set<string> };

type Cursor = { id: string; label: string; color: string; x: MotionValue<number>; y: MotionValue<number>; visible: boolean; clicks: number };
type Drag = { cursor: string; from: { x: number; y: number } } | null;

const NODE_W = 264;
const NODE_H = 124;
const PLANNER = "#0c1512";
const BUILDER = "#c2410c";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const center = (s: CanvasStep) => ({ x: s.x + NODE_W / 2 - 18, y: s.y + 44 });
const outHandle = (s: CanvasStep) => ({ x: s.x + NODE_W + 2, y: s.y + NODE_H / 2 });
const inHandle = (s: CanvasStep) => ({ x: s.x - 2, y: s.y + NODE_H / 2 });

/** Moves a cursor along a gentle arc, the way a hand does, with an ease that settles at the end. */
async function glide(c: Cursor, to: { x: number; y: number }, ms: number) {
  const x0 = c.x.get();
  const y0 = c.y.get();
  const dx = to.x - x0;
  const dy = to.y - y0;
  const dist = Math.hypot(dx, dy) || 1;
  const bend = Math.min(90, dist * 0.16) * (Math.random() > 0.5 ? 1 : -1);
  const mx = x0 + dx * 0.5 + (-dy / dist) * bend;
  const my = y0 + dy * 0.5 + (dx / dist) * bend;
  const t = { duration: ms / 1000, times: [0, 0.52, 1], ease: ["easeIn", "easeOut"] as ("easeIn" | "easeOut")[] };
  const ax = animate(c.x, [x0, mx, to.x], t);
  const ay = animate(c.y, [y0, my, to.y], t);
  // Never wait on a frame that doesn't come (a background tab): land on time regardless.
  await Promise.race([Promise.all([ax, ay]), wait(ms + 120)]);
  ax.stop();
  ay.stop();
  c.x.set(to.x);
  c.y.set(to.y);
}

export function useAssembly({
  steps,
  agents,
  playKey,
}: {
  steps: CanvasStep[];
  agents: { handle: string; name: string; color?: string }[] | undefined;
  /** 0: don't play. Each new value plays it again. */
  playKey: number;
}) {
  const [show, setShow] = useState<Show | undefined>(undefined);
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const [drag, setDrag] = useState<Drag>(null);
  const [caption, setCaption] = useState<string>();
  const latest = useRef(steps);
  const agentsRef = useRef(agents);
  useEffect(() => {
    latest.current = steps;
    agentsRef.current = agents;
  });

  useEffect(() => {
    if (!playKey || !agentsRef.current) return;
    let alive = true;
    const list = latest.current;
    const placed = new Set<string>();
    const claimed = new Set<string>();
    const edges = new Set<string>();
    const sync = () => alive && setShow({ placed: new Set(placed), claimed: new Set(claimed), edges: new Set(edges) });
    const byKey = new Map(list.map((s) => [s.key, s]));
    const pool: Cursor[] = [];
    const add = (id: string, label: string, color: string, at: { x: number; y: number }) => {
      const c: Cursor = { id, label, color, x: motionValue(at.x), y: motionValue(at.y), visible: true, clicks: 0 };
      pool.push(c);
      if (alive) setCursors([...pool]);
      return c;
    };
    const click = (c: Cursor) => {
      c.clicks++;
      if (alive) setCursors([...pool]);
    };
    const hide = (c: Cursor) => {
      c.visible = false;
      if (alive) setCursors([...pool]);
    };
    const nameOf = (h?: string) => agentsRef.current?.find((a) => a.handle === h);

    const minX = Math.min(...list.map((s) => s.x));
    const minY = Math.min(...list.map((s) => s.y));
    const maxX = Math.max(...list.map((s) => s.x)) + NODE_W;
    const maxY = Math.max(...list.map((s) => s.y)) + NODE_H;
    const entries = [
      { x: maxX + 140, y: minY - 90 },
      { x: minX - 160, y: maxY + 110 },
      { x: maxX + 160, y: maxY + 90 },
      { x: (minX + maxX) / 2, y: maxY + 170 },
      { x: minX - 180, y: (minY + maxY) / 2 },
    ];

    (async () => {
      await wait(40);
      if (!alive) return;
      setShow({ placed: new Set(), claimed: new Set(), edges: new Set() });
      setCursors([]);
      setDrag(null);
      await wait(250);
      if (!alive) return;

      // 1. The Planner lays out the steps, in the order they'll run.
      setCaption(`Planner is laying out ${list.length} step${list.length > 1 ? "s" : ""}`);
      const planner = add("planner", "Planner", PLANNER, { x: minX - 140, y: minY - 120 });
      const order = [...list].sort((a, b) => a.x - b.x || a.y - b.y);
      for (const s of order) {
        await glide(planner, center(s), 560);
        if (!alive) return;
        click(planner);
        placed.add(s.key);
        sync();
        await wait(120);
      }
      void glide(planner, { x: minX - 110, y: minY - 70 }, 700);

      // 2. Each agent flies in, claims its steps and drags in the work it builds on.
      const groups = new Map<string, CanvasStep[]>();
      for (const s of order) {
        const g = s.building || s.built ? "builder" : (s.agentHandle ?? "planner");
        groups.set(g, [...(groups.get(g) ?? []), s]);
      }
      const names = [...groups.keys()].filter((g) => g !== "planner" && g !== "builder").map((h) => nameOf(h)?.name ?? h);
      setCaption(names.length ? `${names.join(", ")} ${names.length > 1 ? "are" : "is"} taking ${names.length > 1 ? "their" : "its"} steps` : "Connecting the steps");
      let n = 0;
      await Promise.all(
        [...groups.entries()].map(async ([g, mine], i) => {
          await wait(i * 260);
          if (!alive) return;
          const agent = nameOf(g);
          const c =
            g === "planner"
              ? planner
              : add(g, g === "builder" ? "Builder" : (agent?.name ?? g), g === "builder" ? BUILDER : (agent?.color ?? "#2f7d6d"), entries[n++ % entries.length]!);
          for (const s of mine) {
            await glide(c, center(s), 620 + Math.random() * 160);
            if (!alive) return;
            click(c);
            if (g !== "builder" && g !== "planner") claimed.add(s.key);
            sync();
            await wait(160);
            for (const d of s.dependsOn) {
              const from = byKey.get(d);
              if (!from) continue;
              await glide(c, outHandle(from), 460);
              if (!alive) return;
              click(c);
              setDrag({ cursor: c.id, from: outHandle(from) });
              await glide(c, inHandle(s), 640);
              if (!alive) return;
              setDrag(null);
              edges.add(`${d}->${s.key}`);
              sync();
              click(c);
              await wait(140);
            }
          }
        }),
      );

      // 3. The Builder waits on any agent still being made, then hands it over.
      const builder = pool.find((c) => c.id === "builder");
      if (builder) {
        for (const s of groups.get("builder") ?? []) {
          setCaption(`Builder is making an agent for ${s.title}`);
          await glide(builder, center(s), 500);
          const home = center(s);
          for (let t = 0; alive && latest.current.find((x) => x.key === s.key)?.building && t < 240; t++) {
            await glide(builder, { x: home.x + (Math.random() - 0.5) * 36, y: home.y + (Math.random() - 0.5) * 20 }, 700);
          }
          if (!alive) return;
          click(builder);
          claimed.add(s.key);
          sync();
          const made = latest.current.find((x) => x.key === s.key);
          setCaption(made?.agentHandle ? `New agent ready: ${nameOf(made.agentHandle)?.name ?? made.agentHandle}` : `${s.title}: agents will bid`);
          await wait(700);
        }
      }
      // Steps with no agent are open to bids: the Planner marks them done too.
      for (const s of groups.get("planner") ?? []) claimed.add(s.key);
      sync();

      // 4. Done: the cursors leave, the crew stays.
      setCaption("Your crew is ready");
      await wait(900);
      for (const c of pool) hide(c);
      await wait(1400);
      if (alive) {
        setCaption(undefined);
        setShow(undefined);
      }
    })();

    return () => {
      alive = false;
    };
  }, [playKey]);

  return { show, cursors, drag, caption, playing: show !== undefined };
}

/** Rendered inside React Flow: the cursors and the live connection line, in canvas coordinates. */
export function AssemblyLayer({ cursors, drag, caption }: { cursors: Cursor[]; drag: Drag; caption?: string }) {
  const dragging = drag ? cursors.find((c) => c.id === drag.cursor) : undefined;
  return (
    <>
      <ViewportPortal>
        {dragging && drag ? <DragLine from={drag.from} x={dragging.x} y={dragging.y} color={dragging.color} /> : null}
        <AnimatePresence>
          {cursors
            .filter((c) => c.visible)
            .map((c) => (
              <CursorMark key={c.id} c={c} />
            ))}
        </AnimatePresence>
      </ViewportPortal>
      <Panel position="top-center" className="!m-3 pointer-events-none">
        {caption ? (
          <motion.div
            key={caption}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-white shadow-[0_6px_20px_-8px_rgb(12_21_18/0.5)]"
          >
            {caption}
          </motion.div>
        ) : null}
      </Panel>
    </>
  );
}

function CursorMark({ c }: { c: Cursor }) {
  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0 z-[1000]"
      style={{ x: c.x, y: c.y }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.35 } }}
      transition={{ duration: 0.25 }}
    >
      {/* Click ripple, from the pointer's tip. */}
      <AnimatePresence>
        {c.clicks ? (
          <motion.span
            key={c.clicks}
            className="absolute -top-3 -left-3 size-6 rounded-full"
            style={{ boxShadow: `0 0 0 2px ${c.color}` }}
            initial={{ scale: 0.3, opacity: 0.7 }}
            animate={{ scale: 1.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>
      <motion.svg
        key={`p${c.clicks}`}
        width="22"
        height="24"
        viewBox="0 0 22 24"
        initial={{ scale: 0.86 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 18 }}
        style={{ transformOrigin: "2px 2px", filter: "drop-shadow(0 2px 3px rgb(12 21 18 / 0.28))" }}
      >
        <path d="M2.2 1.6 L19.4 11.1 L11.6 12.9 L8.1 20.6 Z" fill={c.color} stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
      </motion.svg>
      <span
        className="absolute top-[18px] left-[14px] rounded-[6px] px-1.5 py-[3px] text-[11.5px] leading-none font-semibold whitespace-nowrap text-white shadow-[0_2px_6px_-2px_rgb(12_21_18/0.35)]"
        style={{ background: c.color }}
      >
        {c.label}
      </span>
    </motion.div>
  );
}

function DragLine({ from, x, y, color }: { from: { x: number; y: number }; x: MotionValue<number>; y: MotionValue<number>; color: string }) {
  const d = useTransform([x, y], ([cx, cy]: number[]) => {
    const tx = cx! + 2;
    const ty = cy! + 2;
    const k = Math.max(40, Math.abs(tx - from.x) * 0.5);
    return `M ${from.x} ${from.y} C ${from.x + k} ${from.y}, ${tx - k} ${ty}, ${tx} ${ty}`;
  });
  return (
    <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1">
      <motion.path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
      <circle cx={from.x} cy={from.y} r={4.5} fill="white" stroke={color} strokeWidth={2} />
    </svg>
  );
}
