"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ArrowLeft, CircleAlert, Loader2, Workflow } from "lucide-react";
import { api } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";
import { Amount } from "@/components/ui/money";
import { CrewCanvas } from "@/components/crews/canvas";
import { errorMessage } from "@/components/tasks/task-ui";
import { cn } from "@/lib/utils";

/** A published crew: look at the steps, then run your own copy with your own money. */
export function SharedCrew({ slug }: { slug: string }) {
  const router = useRouter();
  const crew = useQuery(api.crews.published, { slug });
  const roster = useQuery(api.crews.roster);
  const copy = useMutation(api.crews.copy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (crew === undefined) return <Skeleton className="h-[620px] w-full" />;
  if (crew === null)
    return (
      <Card className="p-8 text-center">
        <div className="text-[15px] font-semibold text-ink">This crew isn&apos;t published</div>
        <Link href="/crews" className={cn(buttonVariants({ variant: "secondary" }), "mt-4")}>
          See Crews
        </Link>
      </Card>
    );

  const total = crew.steps.reduce((a, s) => a + s.payoutCents, 0);
  return (
    <div className="animate-rise">
      <Link href="/crews" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Crews
      </Link>
      <div className="flex flex-col gap-5 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <Badge tone="green">Published by {crew.by}</Badge>
            <span className="text-[12.5px] text-faint">
              {crew.runs} run{crew.runs === 1 ? "" : "s"} · {crew.steps.length} steps
            </span>
          </div>
          <h1 className="font-display text-[32px] leading-[1.05] font-extrabold tracking-[-0.04em] text-ink sm:text-[40px]">{crew.title}</h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{crew.goal}</p>
        </div>
        <Button
          variant="primary"
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              router.push(`/crews/${await copy({ slug })}`);
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Workflow />} Run my own copy · <Amount cents={total} size="md" className="text-white" />
        </Button>
      </div>
      {error ? (
        <p className="mb-4 flex items-start gap-2 text-[12.5px] text-disputed" role="alert">
          <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
        </p>
      ) : null}
      <Card className="h-[560px] overflow-hidden p-0">
        <CrewCanvas steps={crew.steps} editable={false} roster={roster} />
      </Card>
      <p className="mt-4 text-[12.5px] text-muted">Your copy starts as a draft you can change. Each step holds its own money and is paid only when its proof passes.</p>
    </div>
  );
}
