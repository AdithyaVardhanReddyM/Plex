"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, CircleAlert, Crosshair, Loader2, MapPin, RefreshCw, Upload, X } from "lucide-react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Input, Label, Skeleton, Textarea } from "@/components/ui/primitives";
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

  if (data === undefined) return <Skeleton className="mx-auto h-[520px] w-full max-w-xl" />;
  if (data === null)
    return (
      <Card className="mx-auto max-w-xl">
        <EmptyState icon={<Camera />} title="Task not found" />
      </Card>
    );

  const { task, role } = data;
  const back = (
    <Link href={`/tasks/${task._id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
      <ArrowLeft className="size-4" /> Task
    </Link>
  );

  if (sent)
    return (
      <div className="mx-auto flex max-w-xl items-center gap-2.5 py-10 text-[14px] text-muted">
        <Loader2 className="size-4 animate-spin" strokeWidth={1.9} /> Sent. Opening the checks…
      </div>
    );

  if (role !== "assignee" || !["assigned", "rejected"].includes(task.status))
    return (
      <div className="mx-auto max-w-xl animate-rise">
        <div className="mb-5 flex items-center justify-between gap-3">
          {back}
          <PersonaSwitch />
        </div>
        <Card>
          <EmptyState
            icon={<Camera />}
            title={role === "assignee" ? "Proof is already in" : "Only the assigned worker uploads proof"}
            body={role === "assignee" ? "Plex is checking it, or it's been decided." : "Switch “Acting as” to the person doing this task."}
            action={
              <Link href={`/tasks/${task._id}`} className="text-[13px] font-medium text-green-700 hover:text-green-800">
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

  return (
    <div className="mx-auto max-w-xl animate-rise pb-24 sm:pb-0">
      <div className="mb-5 flex items-center justify-between gap-3">
        {back}
        <PersonaSwitch />
      </div>
      <div className="text-[13px] font-medium text-green-700">Upload proof</div>
      <div className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em] text-balance text-ink">{task.title}</div>

      {/* The challenge code */}
      <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
        <div className="h-1 w-full" style={{ background: "var(--metal)" }} aria-hidden />
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-faint">Challenge code</div>
            <div className="mt-1 text-[13px] leading-snug text-muted">Write it on paper and show it in one photo.</div>
          </div>
          <div className="flex-none rounded-md bg-canvas px-3.5 py-2 font-mono text-[20px] font-semibold tracking-tight text-ink ring-1 ring-line ring-inset">
            {task.challengeCode}
          </div>
        </div>
      </div>

      {/* Location */}
      {task.location ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-surface px-4 py-3 ring-1 ring-line ring-inset">
          <span className="flex min-w-0 items-center gap-2.5 text-[13px]">
            <MapPin className="size-4 flex-none text-faint" strokeWidth={1.9} />
            <span className="min-w-0">
              <span className="block truncate text-ink-2">{task.location.label}</span>
              <span className="block text-[12px] text-muted">
                {geo.state === "ok"
                  ? `Location shared · ±${Math.round(geo.accuracy ?? 0)} m`
                  : geo.state === "denied"
                    ? "Not shared · the place check will need the poster"
                    : "Photos without GPS use your location at upload"}
              </span>
            </span>
          </span>
          {geo.state === "ok" ? (
            <Check className="size-4 flex-none text-green-700" strokeWidth={2.2} />
          ) : (
            <Button variant="secondary" size="sm" onClick={shareLocation} disabled={geo.state === "asking"}>
              {geo.state === "asking" ? <Loader2 className="animate-spin" /> : <Crosshair />} Share
            </Button>
          )}
        </div>
      ) : null}

      {/* Items */}
      <Card className="mt-5">
        <ol className="divide-y divide-line">
          {task.proofSpec.map((s, i) => (
            <li key={i} className="px-4 py-4 sm:px-5">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-8 flex-none items-center justify-center rounded-sm",
                    (files[i] || texts[i]?.trim()) ? "bg-green-50 text-green-700" : "bg-sunken text-ink-2",
                  )}
                >
                  {files[i] || texts[i]?.trim() ? <Check className="size-4" strokeWidth={2.2} /> : <SpecIcon type={s.type} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium text-ink">{s.label}</div>
                  <div className="text-[12.5px] leading-snug text-muted">{s.description}</div>
                </div>
              </div>
              <div className="mt-3 sm:pl-11">
                {s.type === "text" ? (
                  <Textarea value={texts[i] ?? ""} onChange={(e) => setTexts((t) => ({ ...t, [i]: e.target.value }))} className="min-h-20" placeholder="A sentence or two" />
                ) : s.type === "link" ? (
                  <Input value={texts[i] ?? ""} onChange={(e) => setTexts((t) => ({ ...t, [i]: e.target.value }))} placeholder="https://" inputMode="url" />
                ) : (
                  <PhotoSlot picked={files[i]} type={s.type} onPick={(f) => pick(i, f)} onClear={() => clear(i)} />
                )}
              </div>
            </li>
          ))}
        </ol>
        <div className="grid gap-3 border-t border-line px-4 py-4 sm:px-5">
          {hasPhotos ? (
            <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-ink-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 size-4 flex-none accent-[var(--color-green-500)]"
              />
              <span>
                <span className="font-mono text-ink">{task.challengeCode}</span> is visible in one of my photos.
              </span>
            </label>
          ) : null}
          <div>
            <Label htmlFor="note">Note for the poster (optional)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should know" />
          </div>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0">
        {error ? (
          <p className="mb-2 flex items-start gap-2 text-[12.5px] leading-snug text-disputed" role="alert">
            <CircleAlert className="mt-px size-4 flex-none" strokeWidth={1.9} /> {error}
          </p>
        ) : null}
        <Button size="lg" className="w-full" onClick={send} disabled={missing || !!progress}>
          {progress ? <Loader2 className="animate-spin" /> : <Upload />}
          {progress ?? (missing ? "Add every item to submit" : "Submit proof")}
        </Button>
      </div>
    </div>
  );
}

function PhotoSlot({
  picked,
  type,
  onPick,
  onClear,
}: {
  picked?: Picked;
  type: "photo" | "video" | "file" | "text" | "link";
  onPick: (f: File | undefined) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const accept = type === "photo" ? "image/*" : type === "video" ? "video/*" : undefined;
  return (
    <>
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
        <div className="flex items-center gap-3">
          <div className="relative size-20 flex-none overflow-hidden rounded-md bg-sunken ring-1 ring-line ring-inset">
            {picked.file.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={picked.preview} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-faint">
                <SpecIcon type={type} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
            <div className="truncate font-medium text-ink-2">{picked.file.name}</div>
            <div className="text-muted">
              Taken {time(picked.capturedAt)} · {picked.fromExif ? "from the photo" : "file time"}
              {picked.lat !== undefined ? " · has GPS" : ""}
            </div>
          </div>
          <div className="flex flex-none gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => input.current?.click()} aria-label="Replace">
              <RefreshCw />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Remove">
              <X />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong bg-canvas text-[13.5px] font-medium text-ink-2 transition-colors hover:border-green-400 hover:bg-green-50/50 hover:text-green-800"
        >
          <Camera className="size-[18px]" strokeWidth={1.9} />
          {type === "photo" ? "Take or choose a photo" : type === "video" ? "Add a video" : "Add a file"}
        </button>
      )}
    </>
  );
}
