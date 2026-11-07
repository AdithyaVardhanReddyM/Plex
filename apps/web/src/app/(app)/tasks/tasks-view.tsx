"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { ArrowRight, Inbox, ListChecks, Plus } from "lucide-react";
import { api } from "@/lib/convex";
import { buttonVariants } from "@/components/ui/button";
import { Avatar, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { CategoryLabel, StatusBadge, TaskCard, timeLeft } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

type Category = "local" | "remote" | "data" | "agent" | "impact";
type StatusFilter = "open" | "active" | "done";
type Who = "human" | "agent" | undefined;

const CATEGORIES: { value: Category | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "local", label: "Local" },
  { value: "remote", label: "Remote" },
  { value: "agent", label: "Agent work" },
  { value: "data", label: "Data" },
  { value: "impact", label: "Impact" },
];

const WHO: { value: Who; label: string }[] = [
  { value: undefined, label: "Anyone" },
  { value: "human", label: "For people" },
  { value: "agent", label: "For agents" },
];

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "active", label: "In progress" },
  { value: "done", label: "Done" },
];

export function TasksView() {
  const [tab, setTab] = useState<"board" | "mine">("board");
  return (
    <div className="animate-rise">
      <PageHeader
        title="Tasks"
        description="Post work for a person or an AI agent. Someone takes it, Plex checks the proof, and PayPal pays out. Money is held until the proof passes."
        actions={
          <>
            <PersonaSwitch />
            <Link href="/tasks/new" className={buttonVariants({ variant: "primary" })}>
              <Plus /> Post a task
            </Link>
          </>
        }
      />

      <div className="mb-5 flex items-center gap-1 border-b border-line">
        {(
          [
            ["board", "Board"],
            ["mine", "My tasks"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "relative -mb-px h-10 px-3 text-[14px] font-medium transition-colors",
              tab === value ? "text-ink" : "text-muted hover:text-ink",
            )}
            aria-pressed={tab === value}
          >
            {label}
            <span
              className={cn(
                "absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-ink transition-opacity",
                tab === value ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        ))}
      </div>

      {tab === "board" ? <Board /> : <MyTasks />}
    </div>
  );
}

function Board() {
  const [category, setCategory] = useState<Category | undefined>();
  const [status, setStatus] = useState<StatusFilter>("open");
  const [who, setWho] = useState<Who>();
  const tasks = useQuery(api.tasks.board, { category, status, who });

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Kind of work">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setCategory(c.value)}
              aria-pressed={category === c.value}
              className={cn(
                "h-8 flex-none rounded-full px-3.5 text-[13px] font-medium transition-colors",
                category === c.value
                  ? "bg-ink text-white"
                  : "bg-surface text-ink-2 ring-1 ring-line ring-inset hover:bg-sunken",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-none flex-wrap gap-2 self-start">
          <div className="inline-flex rounded-sm bg-sunken p-0.5" role="group" aria-label="Who can take it">
            {WHO.map((w) => (
              <button
                key={w.label}
                type="button"
                onClick={() => setWho(w.value)}
                aria-pressed={who === w.value}
                className={cn(
                  "h-7 rounded-[6px] px-3 text-[13px] font-medium transition-colors",
                  who === w.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-sm bg-sunken p-0.5" role="group" aria-label="Status">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatus(s.value)}
                aria-pressed={status === s.value}
                className={cn(
                  "h-7 rounded-[6px] px-3 text-[13px] font-medium transition-colors",
                  status === s.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tasks === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[178px] w-full rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks />}
            title={status === "open" ? "No open tasks here" : status === "active" ? "Nothing in progress" : "Nothing finished yet"}
            body={status === "open" ? "Post one, or try another kind of work." : "Tasks show up here as people take them."}
            action={
              status === "open" ? (
                <Link href="/tasks/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Post a task
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((t) => (
            <TaskCard key={t._id} task={t} />
          ))}
        </div>
      )}
    </>
  );
}

function MyTasks() {
  const as = useAs();
  const mine = useQuery(api.tasks.mine, { as });
  if (mine === undefined)
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const taking = [...mine.invited, ...mine.taking, ...mine.applied];
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <MineList
        title="Posted"
        description="Work you asked for. Money stays held until you approve the proof."
        tasks={mine.posted}
        empty="You haven't posted anything yet."
      />
      <MineList
        title="Taking"
        description="Tasks you're doing, applied for, or were hired for directly."
        tasks={taking}
        appliedIds={new Set(mine.applied.map((t) => t._id))}
        invitedIds={new Set(mine.invited.map((t) => t._id))}
        empty="Switch to a worker above, or apply to an open task."
      />
    </div>
  );
}

function MineList({
  title,
  description,
  tasks,
  empty,
  appliedIds,
  invitedIds,
}: {
  title: string;
  description: string;
  tasks: FunctionReturnType<typeof api.tasks.mine>["posted"];
  empty: string;
  appliedIds?: Set<string>;
  invitedIds?: Set<string>;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</div>
          <div className="mt-0.5 text-[13px] leading-snug text-muted">{description}</div>
        </div>
        <span className="tabular mt-0.5 text-[13px] text-faint">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Nothing here" body={empty} className="py-10" />
      ) : (
        <ul className="px-2 py-2">
          {tasks.map((t) => (
            <li key={t._id}>
              <Link
                href={`/tasks/${t._id}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md px-3 py-3 transition-colors hover:bg-sunken/70"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-ink">{t.title}</div>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    {invitedIds?.has(t._id) ? (
                      <span className="text-[12.5px] font-medium text-green-700">Hired you directly</span>
                    ) : appliedIds?.has(t._id) ? (
                      <span className="text-[12.5px] font-medium text-steel-600">Applied</span>
                    ) : (
                      <StatusBadge status={t.status} />
                    )}
                    <CategoryLabel task={t} className="min-w-0" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <Amount cents={t.fundingCents} size="sm" />
                    <div className="text-[11.5px] text-faint">{timeLeft(t)}</div>
                  </div>
                  {t.assignee && title === "Posted" ? (
                    <Avatar name={t.assignee.name} color={t.assignee.avatarColor} size={24} />
                  ) : (
                    <ArrowRight className="size-4 text-faint transition-transform group-hover:translate-x-0.5" strokeWidth={1.9} />
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
