"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, CircleAlert, Clock, Crosshair, FileText, Loader2, MapPin, RefreshCw, ShieldCheck, Upload, X } from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, IconTile, Input, Label, Meter, PageHeader, Skeleton, Textarea } from "@/components/ui/primitives";
import { TaskArt } from "@/components/art/empty-art";
import { PersonaSwitch, useAs } from "@/components/tasks/persona";
import { SpecIcon, errorMessage } from "@/components/tasks/task-ui";
import { readPhotoMeta } from "@/components/tasks/exif";
import { cn } from "@/lib/utils";

type Picked = { file: File; preview: string; capturedAt: number; fromExif: boolean; lat?: number; lng?: number };
type Geo = { state: "idle" | "asking" | "ok" | "denied"; lat?: number; lng?: number; accuracy?: number };

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", "");

export function ProofUpload({ id }: { id: string }) {
  const as = useAs();
  const router = useRouter();
  const data = useQuery(api.tasks.get, { id: id as Id<"tasks">, as });
  const generateUploadUrl = useMutation(api.proofs.generateUploadUrl);
  const submit = useMutation(api.proofs.submit);

  const [files, setFiles] = useState<Record<number, Picked>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [geo, setGeo] = useState<Geo>({ state: "idle" });
  const [progress, setProgress] = useState<string>();
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  // Navigate in an effect: the live query flips the task to "verifying" the
  // moment the mutation lands, which re-renders this page before a push runs.
  useEffect(() => {
    if (sent) router.replace(`/tasks/${id}`);
  }, [sent, id, router]);

  if (data === undefined)
    return (
      <div>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-8 h-3.5 w-28" />
        <Skeleton className="mt-3 h-8 w-[28rem] max-w-full" />
        <Skeleton className="mt-3 h-4 w-[36rem] max-w-full" />
        <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-[420px] w-full rounded-lg" />
          <Skeleton className="h-[320px] w-full rounded-lg" />
        </div>
      </div>
    );
  if (data === null)
    return (
      <Card>
        <EmptyState
          art={<TaskArt />}
          title="Task not found"
          body="It may have been removed, or the link is wrong."
          action={
            <Link href="/tasks" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Back to the board
            </Link>
          }
          className="py-14"
        />
      </Card>
    );

  const { task, role } = data;
  const back = (
    <Link href={`/tasks/${task._id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink">
      <ArrowLeft className="size-4" strokeWidth={1.9} /> Task
    </Link>
  );

  if (sent)
    return (
      <div className="flex items-center gap-2.5 py-10 text-[14px] text-muted">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.9} /> Sent. Opening the checks…
      </div>
    );

  if (role !== "assignee" || !["assigned", "rejected"].includes(task.status))
    return (
      <div className="mx-auto max-w-2xl animate-rise">
        <div className="mb-5 flex items-center justify-between gap-3">
          {back}
          <PersonaSwitch />
        </div>
        <Card>
          <EmptyState
            icon={role === "assignee" ? <Check /> : <Camera />}
            className="py-14"
            title={role === "assignee" ? "Proof is already in" : "Only the assigned worker uploads proof"}
            body={role === "assignee" ? "Plex is checking it, or it's been decided." : "Switch “Acting as” to the person doing this task."}
            action={
              <Link href={`/tasks/${task._id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Back to the task
              </Link>
            }
          />
        </Card>
      </div>
    );

  const missing = task.proofSpec.some((s, i) =>
    s.type === "photo" || s.type === "video" || s.type === "file" ? !files[i] : s.type === "text" ? !texts[i]?.trim() : !/^https?:\/\/\S+$/.test(texts[i] ?? ""),
  );
  const hasPhotos = task.proofSpec.some((s) => s.type === "photo");

  function shareLocation() {
    if (!navigator.geolocation) return setGeo({ state: "denied" });
    setGeo({ state: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ state: "ok", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => setGeo({ state: "denied" }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function pick(i: number, file: File | undefined) {
    if (!file) return;
    const meta = await readPhotoMeta(file);
    setFiles((f) => {
      if (f[i]) URL.revokeObjectURL(f[i]!.preview);
      return {
        ...f,
        [i]: {
          file,
          preview: URL.createObjectURL(file),
          capturedAt: meta.capturedAt ?? (file.lastModified || Date.now()),
          fromExif: meta.capturedAt !== undefined,
          lat: meta.lat,
          lng: meta.lng,
        },
      };
    });
  }

  function clear(i: number) {
    setFiles((f) => {
      const next = { ...f };
      if (next[i]) URL.revokeObjectURL(next[i]!.preview);
      delete next[i];
      return next;
    });
  }

  async function send() {
    setError(undefined);
    try {
      const entries = Object.entries(files);
      const items: Parameters<typeof submit>[0]["items"] = [];
      let n = 0;
      for (const [k, p] of entries) {
        n++;
        setProgress(`Uploading ${n} of ${entries.length}…`);
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": p.file.type || "application/octet-stream" }, body: p.file });
        if (!res.ok) throw new Error("An upload failed. Check your connection and try again.");
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        items.push({
          specIndex: Number(k),
          storageId,
          capturedAt: p.capturedAt,
          lat: p.lat ?? geo.lat,
          lng: p.lng ?? geo.lng,
        });
      }
      task.proofSpec.forEach((s, i) => {
        if (s.type === "text") items.push({ specIndex: i, text: texts[i], capturedAt: Date.now(), lat: geo.lat, lng: geo.lng });
        if (s.type === "link") items.push({ specIndex: i, url: texts[i]?.trim() });
      });
      setProgress("Sending to the proof engine…");
      await submit({ taskId: task._id, items, note: note || undefined, challengeConfirmed: confirmed, as });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
      setProgress(undefined);
    }
  }

  const specs = task.proofSpec.map((s, i) => ({ s, i }));
  const media = specs.filter(({ s }) => s.type === "photo" || s.type === "video" || s.type === "file");
  const written = specs.filter(({ s }) => s.type === "text" || s.type === "link");
  const isReady = (i: number) => {
    const s = task.proofSpec[i]!;
    if (s.type === "photo" || s.type === "video" || s.type === "file") return Boolean(files[i]);
    if (s.type === "text") return Boolean(texts[i]?.trim());
    return /^https?:\/\/\S+$/.test(texts[i] ?? "");
  };
  const readyCount = specs.filter(({ i }) => isReady(i)).length;

  return (
    // No animate-rise on the root: a transformed ancestor would trap the phone's fixed submit bar.
    <div className="pb-28 lg:pb-0">
      <div className="mb-5 flex items-center justify-between gap-3">
        {back}
        <PersonaSwitch />
      </div>
      <PageHeader
        eyebrow={
          <>
            <Upload className="size-3.5" strokeWidth={2} /> Upload proof
          </>
        }
        title={task.title}
        description="Add every item below. Plex checks each one against the spec, the time window, the place and the challenge code, then PayPal pays you when it passes."
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 animate-rise flex-col gap-4">
          {media.length ? (
            <Card>
              <CardHeader
                icon={<Camera />}
                title={hasPhotos ? "Photos" : "Files"}
                description={hasPhotos ? "Taken now, on site. The time and place come from the photo when it has them." : "One file per item."}
                action={
                  <span className="tabular text-[12px] text-faint">
                    {media.filter(({ i }) => files[i]).length} of {media.length}
                  </span>
                }
              />
              <div className="grid gap-x-3 gap-y-4 p-5 pt-4 sm:grid-cols-2 xl:grid-cols-3">
                {media.map(({ s, i }) => (
                  <PhotoSlot
                    key={i}
                    n={i + 1}
                    label={s.label}
                    description={s.description}
                    picked={files[i]}
                    type={s.type}
                    onPick={(f) => pick(i, f)}
                    onClear={() => clear(i)}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          {written.length ? (
            <Card>
              <CardHeader icon={<FileText />} title="Write-up" description="Notes and links go to the proof engine as you type them." />
              <ol className="grid gap-4 p-5 pt-4">
                {written.map(({ s, i }) => (
                  <li key={i}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <Label htmlFor={`item-${i}`} className="mb-0">
                        {s.label}
                      </Label>
                      {isReady(i) ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green-700">
                          <Check className="size-3.5" strokeWidth={2.2} /> Ready
                        </span>
                      ) : null}
                    </div>
                    {s.description && s.description !== s.label ? <p className="-mt-0.5 mb-2 text-[12.5px] leading-snug text-muted">{s.description}</p> : null}
                    {s.type === "text" ? (
                      <Textarea
                        id={`item-${i}`}
                        value={texts[i] ?? ""}
                        onChange={(e) => setTexts((t) => ({ ...t, [i]: e.target.value }))}
                        className="min-h-24"
                        placeholder="A sentence or two"
                      />
                    ) : (
                      <Input
                        id={`item-${i}`}
                        value={texts[i] ?? ""}
                        onChange={(e) => setTexts((t) => ({ ...t, [i]: e.target.value }))}
                        placeholder="https://"
                        inputMode="url"
                      />
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          <Card className="p-5">
            <Label htmlFor="note">Note for the poster</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional. Anything they should know." />
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          {/* The challenge code: steel, with the foil edge */}
          <Card className="overflow-hidden">
            <div className="relative bg-gradient-to-b from-steel-50 to-surface px-5 pt-5 pb-4">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: "var(--metal)" }} aria-hidden />
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-steel-700">
                <ShieldCheck className="size-4" strokeWidth={1.9} /> Challenge code
              </div>
              <div className="mt-3 inline-flex rounded-[12px] bg-surface px-4 py-2.5 font-mono text-[24px] leading-none font-semibold tracking-tight text-ink shadow-card ring-1 ring-line ring-inset">
                {task.challengeCode}
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-steel-600">
                Write it on paper and hold it in one photo. It proves the photo was taken for this task, today.
              </p>
            </div>
            {task.location ? (
              <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
                <span className="flex min-w-0 items-start gap-2.5 text-[13px]">
                  <MapPin className="mt-0.5 size-4 flex-none text-faint" strokeWidth={1.9} />
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug text-ink-2">{task.location.label}</span>
                    <span className="block text-[12px] leading-snug text-muted">
                      {geo.state === "ok"
                        ? `Location shared · ±${Math.round(geo.accuracy ?? 0)} m`
                        : geo.state === "denied"
                          ? "Not shared · the place check will need the poster"
                          : "Photos without GPS use your location"}
                    </span>
                  </span>
                </span>
                {geo.state === "ok" ? (
                  <span className="flex size-7 flex-none items-center justify-center rounded-full bg-green-50 text-green-700 ring-1 ring-green-200 ring-inset">
                    <Check className="size-3.5" strokeWidth={2.4} />
                  </span>
                ) : (
                  <Button variant="secondary" size="sm" onClick={shareLocation} disabled={geo.state === "asking"}>
                    {geo.state === "asking" ? <Loader2 className="animate-spin" /> : <Crosshair />} Share
                  </Button>
                )}
              </div>
            ) : null}
          </Card>

          <Card className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:rounded-none max-lg:border-x-0 max-lg:border-b-0 max-lg:shadow-float">
            <div className="hidden px-5 pt-4 lg:block">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-ink">Ready to send</span>
                <span className="tabular text-[12px] text-muted">
                  {readyCount} of {specs.length} items
                </span>
              </div>
              <Meter value={specs.length ? readyCount / specs.length : 0} className="mt-2" label="Items ready" />
              <ul className="mt-3 space-y-1.5">
                {specs.map(({ s, i }) => (
                  <li key={i} className="flex items-center gap-2 text-[12.5px]">
                    {isReady(i) ? (
                      <Check className="size-3.5 flex-none text-green-700" strokeWidth={2.4} />
                    ) : (
                      <span className="mx-[3px] size-2 flex-none rounded-full border border-line-strong" />
                    )}
                    <span className={cn("truncate", isReady(i) ? "text-ink-2" : "text-muted")}>{s.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-3 px-4 py-3 lg:px-5 lg:pt-4 lg:pb-5">
              {hasPhotos ? (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-[10px] bg-canvas/70 px-3 py-2.5 text-[12.5px] leading-snug text-ink-2 ring-1 ring-line ring-inset">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-px size-4 flex-none accent-[var(--color-green-500)]"
                  />
                  <span>
                    <span className="font-mono font-semibold text-ink">{task.challengeCode}</span> is visible in one of my photos.
                  </span>
                </label>
              ) : null}
              {error ? (
                <p className="flex items-start gap-2 text-[12.5px] leading-snug text-disputed" role="alert">
                  <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
                </p>
              ) : null}
              <Button size="lg" className="w-full" onClick={send} disabled={missing || !!progress}>
                {progress ? <Loader2 className="animate-spin" /> : <Upload />}
                {progress ?? (missing ? `Add ${specs.length - readyCount} more to submit` : "Submit proof")}
              </Button>
              <p className="hidden text-center text-[12px] leading-snug text-faint lg:block">
                The poster sees each check resolve as it runs.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function PhotoSlot({
  n,
  label,
  description,
  picked,
  type,
  onPick,
  onClear,
}: {
  n: number;
  label: string;
  description: string;
  picked?: Picked;
  type: "photo" | "video" | "file" | "text" | "link";
  onPick: (f: File | undefined) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accept = type === "photo" ? "image/*" : type === "video" ? "video/*" : undefined;
  const isImage = picked?.file.type.startsWith("image/");
  return (
    <figure className="min-w-0">
      <input
        ref={input}
        type="file"
        accept={accept}
        capture={type === "photo" ? "environment" : undefined}
        className="sr-only"
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {picked ? (
        <div className="group relative aspect-[4/3] overflow-hidden rounded-[12px] bg-sunken ring-1 ring-line ring-inset">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picked.preview} alt={label} className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center">
              <IconTile tone="white" size="md">
                <SpecIcon type={type} />
              </IconTile>
              <span className="max-w-full truncate text-[12.5px] font-medium text-ink-2">{picked.file.name}</span>
            </div>
          )}
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              onClick={() => input.current?.click()}
              aria-label={`Replace ${label}`}
              className="flex size-8 items-center justify-center rounded-full bg-surface/95 text-ink-2 shadow-card ring-1 ring-line transition-colors hover:text-ink"
            >
              <RefreshCw className="size-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${label}`}
              className="flex size-8 items-center justify-center rounded-full bg-surface/95 text-ink-2 shadow-card ring-1 ring-line transition-colors hover:text-disputed"
            >
              <X className="size-3.5" strokeWidth={2} />
            </button>
          </div>
          <div className="absolute inset-x-2 bottom-2 flex flex-wrap gap-1">
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-surface/95 px-2 text-[11.5px] font-medium text-ink-2 shadow-card">
              <Clock className="size-3 text-faint" strokeWidth={2.2} />
              {time(picked.capturedAt)} · {picked.fromExif ? "from the photo" : "file time"}
            </span>
            {picked.lat !== undefined ? (
              <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-surface/95 px-2 text-[11.5px] font-medium text-green-800 shadow-card">
                <MapPin className="size-3" strokeWidth={2.2} /> GPS
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            onPick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 rounded-[12px] border border-dashed px-4 text-center transition-colors",
            over
              ? "border-green-500 bg-green-50/70"
              : "border-line-strong bg-canvas/60 hover:border-green-400 hover:bg-green-50/40",
          )}
        >
          <IconTile tone={over ? "mint" : "white"} size="md">
            {type === "photo" ? <Camera /> : <SpecIcon type={type} />}
          </IconTile>
          <span>
            <span className="block text-[13px] font-medium text-ink">
              {type === "photo" ? "Take or choose a photo" : type === "video" ? "Add a video" : "Add a file"}
            </span>
            <span className="mt-0.5 hidden text-[12px] text-faint sm:block">or drop it here</span>
          </span>
        </button>
      )}
      <figcaption className="mt-2 grid grid-cols-[18px_minmax(0,1fr)] gap-x-2">
        <span
          className={cn(
            "tabular mt-px flex size-[18px] items-center justify-center rounded-full text-[10.5px] font-semibold",
            picked ? "bg-green-300 text-ink" : "bg-sunken text-muted",
          )}
        >
          {picked ? <Check className="size-3" strokeWidth={2.6} /> : n}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
          {description && description !== label ? <span className="block text-[12px] leading-snug text-muted">{description}</span> : null}
        </span>
      </figcaption>
    </figure>
  );
}
