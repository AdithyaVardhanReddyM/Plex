"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The confirmation step every action tool goes through. Says exactly what will
 * happen, to whom and for how much, and what happens next.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  detail,
  confirmLabel,
  moves,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel: string;
  /** Money moves: the confirm button is brand green. */
  moves?: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={close} />
      <div className="relative w-full max-w-[420px] animate-rise rounded-xl border border-line bg-surface p-5 shadow-float">
        <div className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{title}</div>
        <div className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{body}</div>
        {detail ? <div className="mt-3.5 rounded-[10px] bg-canvas px-3.5 py-3 text-[12.5px] leading-relaxed text-muted ring-1 ring-inset ring-line">{detail}</div> : null}
        {error ? <div className="mt-3 text-[13px] text-disputed">{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant={moves ? "brand" : "primary"}
            className={cn(busy && "opacity-70")}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                close();
              } catch (e) {
                setError((e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0] ?? "Something went wrong");
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A quiet toast at the bottom of the screen. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4">
      <div className="flex animate-rise items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-float" role="status">
        <span className="size-1.5 rounded-full bg-green-400" aria-hidden />
        {message}
      </div>
    </div>,
    document.body,
  );
}
