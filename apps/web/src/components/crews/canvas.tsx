"use client";

import "@xyflow/react/dist/style.css";
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import { Check, CircleAlert, ImageIcon, Loader2, Lock, Sparkles } from "lucide-react";
import { STATE_WORDS, type StepState } from "@plex/backend/lib/crew";
import { Avatar } from "@/components/ui/primitives";
import { AiAgentIcon } from "@/components/ui/icons";
import { cn, formatCents } from "@/lib/utils";
import type { Show } from "./assembly";

export type CanvasStep = {
  key: string;
  title: string;
  payoutCents: number;
  dependsOn: string[];
  agentHandle?: string;
  building?: boolean;
  built?: boolean;
  x: number;
  y: number;
  deliver: { label: string; type: "text" | "file" | "link" };
  state?: StepState;
  worker?: { name: string; color?: string } | null;
  bids?: number;
  output?: { text?: string; url?: string; image?: string | null; video?: string | null } | null;
};

type Phase = "hidden" | "placed" | "claimed";
type StepData = { step: CanvasStep; selected: boolean; agentName?: string; agentColor?: string; phase: Phase };

/** Words and color per state: status is said in words, never with dots. */
export const STATE_TONE: Record<StepState, string> = {
  waiting: "text-faint",
  ready: "text-ink-2",
  funding: "text-steel-700",
  needs_approval: "text-refunded",
  bidding: "text-steel-700",
  working: "text-steel-700",
  checking: "text-steel-700",
  paid: "text-green-700",
  failed: "text-disputed",
};

const busy = (s?: StepState) => s === "funding" || s === "bidding" || s === "working" || s === "checking";

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const { step, selected, phase } = data;
  const s = step.state;
  const name = step.worker?.name ?? data.agentName;
  const claimed = phase === "claimed";
  return (
    <div
      className={cn(
        "w-[264px] rounded-[16px] bg-surface p-4 text-left shadow-[0_1px_2px_rgb(12_21_18/0.06),0_8px_24px_-12px_rgb(12_21_18/0.18)] ring-1",
        "transition-[opacity,transform,box-shadow] duration-[420ms] ease-[var(--ease-out-soft)]",
        phase === "hidden" ? "translate-y-1.5 scale-[0.94] opacity-0" : "translate-y-0 scale-100 opacity-100",
        selected ? "ring-2 ring-ink" : s === "paid" ? "ring-green-300" : s === "failed" ? "ring-disputed/40" : step.building ? "ring-[#c2410c]/30" : "ring-line",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !border-surface !bg-line-strong" />
      <div className="flex items-center gap-2.5">
        {!claimed ? (
          <span className="skeleton size-[30px] flex-none rounded-[9px]" />
        ) : step.building ? (
          <span className="flex size-[30px] flex-none items-center justify-center rounded-[9px] border border-dashed border-[#c2410c]/50 text-[#c2410c]">
            <Loader2 className="size-4 animate-spin" strokeWidth={2} />
          </span>
        ) : name ? (
          <span key={name} className="animate-pop">
            <Avatar name={name} color={step.worker?.color ?? data.agentColor} square size={30} />
          </span>
        ) : (
          <AiAgentIcon className="size-[22px] text-faint" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{step.title}</div>
          <div className="flex items-center gap-1.5 truncate text-[12px] text-muted">
            {!claimed ? (
              "Finding an agent…"
            ) : step.building ? (
              <span className="text-[#c2410c]">Building an agent…</span>
            ) : (
              <>
                {name ?? "Agents will bid"}
                {step.built && name ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#c2410c]/10 px-1.5 py-px text-[10.5px] font-semibold text-[#c2410c]">
                    <Sparkles className="size-2.5" strokeWidth={2.4} /> New
                  </span>
                ) : null}
              </>
            )}
          </div>
        </div>
        <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink tabular">{formatCents(step.payoutCents)}</span>
      </div>

      {step.output?.video ? (
        <video src={step.output.video} autoPlay muted loop playsInline className="nodrag mt-3 h-56 w-full rounded-[12px] bg-ink object-contain" />
      ) : step.output?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={step.output.image} alt={step.deliver.label} className="mt-3 aspect-square w-full rounded-[12px] bg-canvas object-cover" />
      ) : step.output?.text ? (
        <p className="mt-3 line-clamp-3 rounded-[12px] bg-canvas/70 px-3 py-2 text-[12.5px] leading-snug text-ink-2">{step.output.text}</p>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-faint">
          {step.deliver.type === "file" ? <ImageIcon className="size-3.5" strokeWidth={1.9} /> : null}
          Delivers: {step.deliver.label}
        </div>
      )}

      {s ? (
        <div className={cn("mt-3 flex items-center gap-1.5 text-[12.5px] font-medium", STATE_TONE[s])}>
          {s === "paid" ? (
            <Check className="size-3.5" strokeWidth={2.2} />
          ) : s === "failed" || s === "needs_approval" ? (
            <CircleAlert className="size-3.5" strokeWidth={2} />
          ) : busy(s) ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : s === "waiting" ? (
            <Lock className="size-3.5" strokeWidth={1.9} />
          ) : null}
          {STATE_WORDS[s]}
          {s === "bidding" && step.bids ? <span className="font-normal text-muted"> · {step.bids} bid{step.bids > 1 ? "s" : ""}</span> : null}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-2 !border-surface !bg-line-strong" />
    </div>
  );
}

const nodeTypes = { step: StepNode };

function Canvas({
  steps,
  editable,
  selected,
  onSelect,
  onMove,
  onConnect,
  onDisconnect,
  roster,
  show,
  children,
}: {
  steps: CanvasStep[];
  editable: boolean;
  selected?: string;
  onSelect?: (key: string | undefined) => void;
  onMove?: (key: string, x: number, y: number) => void;
  onConnect?: (from: string, to: string) => void;
  onDisconnect?: (from: string, to: string) => void;
  roster?: { handle: string; name: string; color?: string }[];
  /** While the crew assembles: which steps are placed and claimed, which edges drawn. */
  show?: Show;
  children?: React.ReactNode;
}) {
  const toNodes = useCallback(
    (): Node<StepData>[] =>
      steps.map((s) => {
        const agent = roster?.find((a) => a.handle === s.agentHandle);
        const phase: Phase = !show ? "claimed" : show.claimed.has(s.key) ? "claimed" : show.placed.has(s.key) ? "placed" : "hidden";
        return {
          id: s.key,
          type: "step",
          position: { x: s.x, y: s.y },
          data: { step: s, selected: s.key === selected, agentName: agent?.name, agentColor: agent?.color, phase },
          draggable: editable && !show,
          connectable: editable && !show,
        };
      }),
    [steps, selected, editable, roster, show],
  );
  const [nodes, setNodes] = useState<Node<StepData>[]>(toNodes);
  // New data from Convex: rebuild the nodes, keeping what React Flow measured.
  const [synced, setSynced] = useState(() => toNodes);
  if (synced !== toNodes) {
    setSynced(() => toNodes);
    setNodes((prev) => toNodes().map((n) => ({ ...n, measured: prev.find((p) => p.id === n.id)?.measured })));
  }

  const state = useMemo(() => Object.fromEntries(steps.map((s) => [s.key, s.state])), [steps]);
  const edges: Edge[] = useMemo(
    () =>
      steps.flatMap((s) =>
        s.dependsOn
          .filter((d) => !show || show.edges.has(`${d}->${s.key}`))
          .map((d) => {
            const done = state[d] === "paid";
            return {
              id: `${d}->${s.key}`,
              source: d,
              target: s.key,
              type: "smoothstep",
              deletable: editable && !show,
              className: show ? "edge-draw" : undefined,
              style: { stroke: done ? "var(--color-green-500)" : "var(--color-line-strong)", strokeWidth: done ? 2.5 : 1.75 },
            };
          }),
      ),
    [steps, state, editable, show],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={(changes: NodeChange<Node<StepData>>[]) => setNodes((n) => applyNodeChanges(changes, n))}
      onNodeDragStop={(_, node) => onMove?.(node.id, Math.round(node.position.x), Math.round(node.position.y))}
      onConnect={(c: Connection) => c.source && c.target && c.source !== c.target && onConnect?.(c.source, c.target)}
      onEdgesDelete={(es) => es.forEach((e) => onDisconnect?.(e.source, e.target))}
      onNodeClick={(_, node) => onSelect?.(node.id)}
      onPaneClick={() => onSelect?.(undefined)}
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.22, maxZoom: 1.05 }}
      minZoom={0.4}
      maxZoom={1.6}
      attributionPosition="bottom-left"
      className="crew-canvas"
    >
      <Controls showInteractive={false} position="bottom-right" className="!rounded-[12px] !shadow-card [&_button]:!border-line" />
      {children}
    </ReactFlow>
  );
}

export function CrewCanvas(props: React.ComponentProps<typeof Canvas>) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
