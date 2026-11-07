"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { ArrowRight, Clock, Cpu, CircleCheck, Hourglass, Inbox, LayoutGrid, ListChecks, Lock, Plus, UserRound } from "lucide-react";
import { CATEGORY_LABEL } from "@plex/backend/lib/taskRules";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Card, CardHeader, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { TaskArt } from "@/components/art/empty-art";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { KIND_ICON, KindTile, StatusBadge, TaskCard, TaskCardSkeleton, timeLeft } from "@/components/tasks/task-ui";
import { cn, formatCents } from "@/lib/utils";

type BoardTask = FunctionReturnType<typeof api.tasks.board>[number];
type Category = BoardTask["category"];
type StatusFilter = "open" | "active" | "done";
type Who = "any" | "human" | "agent";

const CATEGORIES: (Category | "all")[] = ["all", "local", "remote", "agent", "data", "creator", "impact"];

const HELD_STATES = new Set(["authorized", "captured"]);

export function TasksView() {
  const [tab, setTab] = useState<"board" | "mine">("board");
  return (
    <div className="animate-rise">
      <PageHeader
        title="Tasks"
        description="Post work for a person or an AI agent. PayPal holds the payout, Plex checks the proof, and the money moves only when it passes."
        actions={<PersonaSwitch />}
      />

      <BoardStats />

      <div className="mt-8 mb-4 flex items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { value: "board", label: "Board", icon: <LayoutGrid /> },
            { value: "mine", label: "My tasks", icon: <UserRound /> },
          ]}
        />
        <Link href="/tasks/new" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "sm:hidden")}>
          <Plus /> Post
        </Link>
      </div>

      {tab === "board" ? <Board /> : <MyTasks />}
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

const GLASS = "rounded-full bg-white/[0.08] px-2.5 py-1 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]";

/** A big amount for dark grounds: the sign small and dim, the digits in the display face. */
function BigMoney({ cents, className }: { cents: number; className?: string }) {
  const f = formatCents(cents);
  return (
    <span className={cn("tabular inline-flex items-start font-display font-extrabold tracking-[-0.045em]", className)}>
      <span className="mt-[0.18em] mr-1 text-[0.42em] font-bold text-white/45">$</span>
      {f.replace("$", "")}
    </span>
  );
}

/**
 * The board, lit: the money waiting for takers as the one big figure, what's
 * moving and what's been paid as glass chips, the open money split by kind of
 * work below. Beside it, the brushed-metal card for what PayPal holds.
 */
function BoardStats() {
  const open = useQuery(api.tasks.board, { status: "open" });
  const active = useQuery(api.tasks.board, { status: "active" });
  const done = useQuery(api.tasks.board, { status: "done" });
  const loading = !open || !active || !done;

  const held = [...(open ?? []), ...(active ?? [])].filter((t) => HELD_STATES.has(t.funding.state));
  const heldCents = held.reduce((s, t) => s + t.fundingCents, 0);
  const paid = (done ?? []).filter((t) => t.status === "paid");
  const paidCents = paid.reduce((s, t) => s + t.fundingCents, 0);
  const openCents = (open ?? []).reduce((s, t) => s + t.fundingCents, 0);
  const agentsOpen = (open ?? []).filter((t) => (t.workerType ?? "human") !== "human").length;
  const inProof = (active ?? []).length;

  // Open money by kind of work, biggest first.
  const byKind = useMemo(() => {
    const m = new Map<Category, number>();
    for (const t of open ?? []) m.set(t.category, (m.get(t.category) ?? 0) + t.fundingCents);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [open]);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="@container spotlight flex min-h-[300px] flex-col rounded-xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-white/60">
            <ListChecks className="size-4 text-green-300" strokeWidth={1.9} />
            Open on the board
          </div>
          <span className={cn(GLASS, "tabular text-[11.5px] font-medium text-white/60")}>
            {loading ? "…" : `${open!.length} task${open!.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="mt-4">
          {loading ? (
            <div className="h-14 w-48 rounded-lg bg-white/10" />
          ) : (
            <BigMoney cents={openCents} className="text-[56px] leading-none text-white @[480px]:text-[68px]" />
          )}
        </div>
        <p className="mt-2 text-[13px] text-white/50">Waiting for a taker, and paid only on proof.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] font-medium">
          <span className={cn(GLASS, "tabular flex items-center gap-1.5 text-white/75")}>
            <Cpu className="size-3 text-white/50" strokeWidth={2.2} />
            {loading ? "…" : `${agentsOpen} open to AI agents`}
          </span>
          <span className={cn(GLASS, "tabular flex items-center gap-1.5 text-white/75")}>
            <Hourglass className="size-3 text-white/50" strokeWidth={2.2} />
            {loading ? "…" : `${inProof} in progress`}
          </span>
          <span className="tabular flex items-center gap-1 rounded-full bg-green-300/15 px-2.5 py-1 text-green-200 shadow-[inset_0_0_0_1px_rgb(110_243_214/0.25)]">
            <CircleCheck className="size-3" strokeWidth={2.4} />
            {loading ? "…" : `${formatCents(paidCents)} paid on proof · ${paid.length} task${paid.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {/* The open money by kind of work: one bar, a segment per kind */}
        <div className="mt-auto pt-8">
          {loading ? (
            <div className="h-2 w-full rounded-full bg-white/10" />
          ) : byKind.length ? (
            <>
              <div className="flex h-2 gap-1">
                {byKind.map(([k, cents], i) => (
                  <span
                    key={k}
                    className="h-full min-w-2 rounded-full"
                    style={{
                      flexGrow: cents,
                      background: i === 0 ? "var(--meter-brand)" : `rgb(255 255 255 / ${Math.max(0.14, 0.42 - i * 0.1)})`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {byKind.map(([k, cents], i) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <span key={k} className="flex items-center gap-1.5 text-[12px]">
                      <Icon className={cn("size-3.5", i === 0 ? "text-green-300" : "text-white/40")} strokeWidth={1.9} />
                      <span className="text-white/55">{CATEGORY_LABEL[k]}</span>
                      <span className="tabular font-semibold text-white/90">{formatCents(cents)}</span>
                    </span>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-[12.5px] text-white/45">Nothing open right now. Post a task and it shows up here.</p>
          )}
        </div>
      </div>

      {/* Held: a brushed-metal card, like one in a wallet */}
      <div className="metal-card flex min-h-[220px] flex-col justify-between rounded-xl p-6 sm:p-7">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-steel-800">
            <Lock className="size-4" strokeWidth={2} />
            Held by PayPal
          </div>
          <span className="h-7 w-9 rounded-[7px] bg-[linear-gradient(135deg,var(--color-steel-50),var(--color-steel-200)_45%,var(--color-steel-50))] shadow-[inset_0_0_0_1px_rgb(24_38_59/0.18)]" aria-hidden />
        </div>
        <div>
          {loading ? (
            <Skeleton className="h-12 w-28 bg-white/40" />
          ) : (
            <span className="tabular font-display text-[48px] leading-none font-extrabold tracking-[-0.045em] text-steel-900">
              {formatCents(heldCents)}
            </span>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-steel-800">
            <Clock className="size-3.5" strokeWidth={2} />
            {loading ? "…" : `Across ${held.length} task${held.length === 1 ? "" : "s"}`}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-steel-800/75">
            Released only when the proof passes. Back to the poster if it doesn&apos;t.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Board ────────────────────────────────────────────────────────────────────

function Board() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [who, setWho] = useState<Who>("any");
  const whoArg = who === "any" ? undefined : who;

  // One query per status (filtered by who), so every filter can show its count.
  const open = useQuery(api.tasks.board, { status: "open", who: whoArg });
  const active = useQuery(api.tasks.board, { status: "active", who: whoArg });
  const done = useQuery(api.tasks.board, { status: "done", who: whoArg });
  const byStatus = { open, active, done };
  const list = byStatus[status];

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of list ?? []) c.set(t.category, (c.get(t.category) ?? 0) + 1);
    return c;
  }, [list]);
  const inCategory = (rows: BoardTask[] | undefined) =>
    rows ? (category === "all" ? rows : rows.filter((t) => t.category === category)) : undefined;
  const tasks = inCategory(list);

  // Kinds with nothing in this view drop out; the selected one always stays.
  const kinds = list ? CATEGORIES.filter((k) => k === "all" || k === category || (counts.get(k) ?? 0) > 0) : CATEGORIES;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          size="sm"
          value={category}
          onChange={setCategory}
          items={kinds.map((k) => ({
            value: k,
            label: k === "all" ? "All work" : CATEGORY_LABEL[k],
            count: list ? (k === "all" ? list.length : (counts.get(k) ?? 0)) : undefined,
          }))}
          className="self-start"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={who}
            onChange={setWho}
            items={[
              { value: "any", label: "Anyone" },
              { value: "human", label: "People", icon: <UserRound /> },
              { value: "agent", label: "Agents", icon: <Cpu /> },
            ]}
          />
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            items={[
              { value: "open", label: "Open", count: inCategory(open)?.length },
              { value: "active", label: "In progress", count: inCategory(active)?.length },
              { value: "done", label: "Done", count: inCategory(done)?.length },
            ]}
          />
        </div>
      </div>

      {tasks === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <TaskCardSkeleton key={i} />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState
            art={<TaskArt />}
            title={status === "open" ? "No open tasks here" : status === "active" ? "Nothing in progress" : "Nothing finished yet"}
            body={
              status === "open"
                ? "Nothing matches these filters. Post one and PayPal holds the payout until the proof passes."
                : "Tasks show up here as people and agents take them."
            }
            action={
              status === "open" ? (
                <Link href="/tasks/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
                  <Plus /> Post a task
                </Link>
              ) : (
                <button type="button" onClick={() => setStatus("open")} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  See open tasks
                </button>
              )
            }
            className="py-14"
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {tasks.map((t) => (
              <TaskCard key={t._id} task={t} />
            ))}
          </div>
          <p className="mt-5 text-center text-[12px] text-faint">
            {tasks.length} task{tasks.length === 1 ? "" : "s"} ·{" "}
            {status === "open" ? "ending soonest first" : "newest first"}
          </p>
        </>
      )}
    </>
  );
}

// ── Mine ─────────────────────────────────────────────────────────────────────

type MineTask = FunctionReturnType<typeof api.tasks.mine>["posted"][number];

function MyTasks() {
  const as = useAs();
  const mine = useQuery(api.tasks.mine, { as });
  if (mine === undefined)
    return (
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <div className="px-5 pt-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-3 w-64" />
            </div>
            <div className="px-2 py-3">
              {["w-3/5", "w-2/5", "w-4/6"].map((w) => (
                <div key={w} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="size-5 rounded-[6px]" />
                  <div className="flex-1">
                    <Skeleton className={cn("h-3.5", w)} />
                    <Skeleton className="mt-2 h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    );

  const taking = [...mine.invited, ...mine.taking, ...mine.applied];
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <MineList
        title="Posted"
        description="Work you asked for. PayPal holds it until you approve the proof."
        tasks={mine.posted}
        emptyTitle="You haven't posted anything"
        empty="Post a task and the payout is held until the proof passes."
        emptyAction={
          <Link href="/tasks/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Plus /> Post a task
          </Link>
        }
      />
      <MineList
        title="Taking"
        description="Tasks you're doing, applied for, or were hired for directly."
        tasks={taking}
        appliedIds={new Set(mine.applied.map((t) => t._id))}
        invitedIds={new Set(mine.invited.map((t) => t._id))}
        emptyTitle="Nothing on your plate"
        empty="Apply to an open task on the board, or switch “Acting as” to a demo worker."
      />
    </div>
  );
}

function MineList({
  title,
  description,
  tasks,
  emptyTitle,
  empty,
  emptyAction,
  appliedIds,
  invitedIds,
}: {
  title: string;
  description: string;
  tasks: MineTask[];
  emptyTitle: string;
  empty: string;
  emptyAction?: React.ReactNode;
  appliedIds?: Set<string>;
  invitedIds?: Set<string>;
}) {
  const posted = title === "Posted";
  return (
    <Card>
      <CardHeader
        className="px-5"
        title={title}
        description={description}
        action={<span className="tabular rounded-full bg-sunken px-2 text-[12px] leading-[22px] font-medium text-ink-2">{tasks.length}</span>}
      />
      {tasks.length === 0 ? (
        <EmptyState icon={<Inbox />} title={emptyTitle} body={empty} action={emptyAction} className="py-10" />
      ) : (
        <ul className="px-2 pt-2.5 pb-2">
          {tasks.map((t) => (
            <li key={t._id}>
              <Link
                href={`/tasks/${t._id}`}
                className="group grid grid-cols-[34px_minmax(0,1fr)_auto_24px] items-center gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-sunken/70"
              >
                <span className="flex size-[34px] items-center justify-center"><KindTile category={t.category} size="md" /></span>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium text-ink">{t.title}</div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                    <span className="flex-none">{CATEGORY_LABEL[t.category]}</span>
                    {t.location || t.category !== "remote" ? (
                      <>
                        <span className="text-faint">·</span>
                        <span className="truncate">{t.location ? t.location.label : "Remote"}</span>
                      </>
                    ) : null}
                    <span className="text-faint">·</span>
                    <span className="flex-none">{timeLeft(t)}</span>
                  </div>
                </div>
                <div className="flex min-w-[84px] flex-col items-end gap-1">
                  <Amount cents={t.fundingCents} size="sm" />
                  {invitedIds?.has(t._id) ? (
                    <span className="text-[11.5px] font-medium text-green-700">Hired you</span>
                  ) : appliedIds?.has(t._id) ? (
                    <span className="text-[11.5px] font-medium text-steel-600">Applied</span>
                  ) : (
                    <StatusBadge status={t.status} />
                  )}
                </div>
                <span className="flex justify-end">
                  {t.assignee && posted ? (
                    <span title={t.assignee.name}>
                      <Avatar name={t.assignee.name} color={t.assignee.avatarColor} size={24} square={t.assignee.kind === "agent"} />
                    </span>
                  ) : (
                    <ArrowRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5" strokeWidth={1.9} />
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
