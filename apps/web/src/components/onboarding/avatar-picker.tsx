"use client";

import { Check, Shuffle } from "lucide-react";
import { useState } from "react";
import { faceUrl } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const randomSeed = () => Math.random().toString(36).slice(2, 9);

/**
 * Pick the face people see: the photo on your account, or a DiceBear face
 * (shuffle for new ones). The value is the image URL.
 */
export function AvatarPicker({
  name,
  value,
  accountPhoto,
  onChange,
}: {
  name: string;
  value: string | undefined;
  accountPhoto?: string;
  onChange: (url: string) => void;
}) {
  const [seeds, setSeeds] = useState(() => [name || "Plex", randomSeed(), randomSeed(), randomSeed()]);
  const faces = seeds.map((s) => faceUrl(s));
  const options = [...(accountPhoto ? [accountPhoto] : []), ...faces];
  const current = value ?? options[0]!;

  return (
    <div className="flex items-center gap-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current} alt="Your photo" className="size-[84px] flex-none rounded-full bg-sunken object-cover shadow-raised" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {options.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => onChange(url)}
              aria-label={accountPhoto && i === 0 ? "Use your account photo" : `Use face ${i + 1}`}
              aria-pressed={url === current}
              className={cn(
                "relative size-10 overflow-hidden rounded-full transition-[box-shadow,transform] hover:scale-105",
                url === current ? "shadow-[0_0_0_2px_var(--color-canvas),0_0_0_4px_var(--color-ink)]" : "shadow-card",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-full object-cover" />
              {url === current ? (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/35 text-white">
                  <Check className="size-4" strokeWidth={2.4} />
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              const next = [randomSeed(), randomSeed(), randomSeed(), randomSeed()];
              setSeeds(next);
              onChange(faceUrl(next[0]!));
            }}
            className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
          >
            <Shuffle className="size-4" strokeWidth={1.9} /> Shuffle
          </button>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">{accountPhoto ? "Your account photo, or a face of ours." : "Pick a face, or shuffle for more."}</p>
      </div>
    </div>
  );
}
