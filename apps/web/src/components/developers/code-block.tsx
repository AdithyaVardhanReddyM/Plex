"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Copies `value`; the icon turns into a check for a moment. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink [&_svg]:size-3.5 [&_svg]:stroke-[1.9]",
        copied && "text-green-700 hover:text-green-700",
        className,
      )}
      aria-label={copied ? "Copied" : label || "Copy"}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * Quiet syntax colour for JSON and shell: keys in steel, strings in deep mint,
 * flags in ink, the rest muted. React nodes only, never injected HTML.
 */
function highlight(code: string) {
  const out: React.ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')(\s*:)?|(\s-{1,2}[A-Za-z][\w-]*)|(\$[A-Z_]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    if (m[1]) {
      out.push(
        <span key={i++} className={m[2] ? "text-steel-700" : "text-green-800"}>
          {m[1]}
        </span>,
      );
      if (m[2]) out.push(m[2]);
    } else if (m[3]) {
      out.push(
        <span key={i++} className="text-ink">
          {m[3]}
        </span>,
      );
    } else if (m[4]) {
      out.push(
        <span key={i++} className="text-refunded">
          {m[4]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

/**
 * A code sample: light, on the canvas, with a header strip (label, copy).
 * Without `title` it renders bare, for small request bodies inside a row.
 */
export function CodeBlock({
  code,
  title,
  lang,
  copy = true,
  className,
  bodyClassName,
}: {
  code: string;
  title?: React.ReactNode;
  lang?: string;
  copy?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[12px] border border-line bg-canvas", className)}>
      {title || lang ? (
        <div className="flex h-10 items-center justify-between gap-3 border-b border-line bg-surface/70 pr-1.5 pl-3.5">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] font-medium text-ink-2">
            {lang ? <span className="rounded-[5px] bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-muted">{lang}</span> : null}
            <span className="truncate">{title}</span>
          </div>
          {copy ? <CopyButton value={code} /> : null}
        </div>
      ) : null}
      <div className="relative">
        <pre
          className={cn(
            "overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.65] text-muted",
            copy && !title && !lang && "pr-12",
            bodyClassName,
          )}
        >
          <code>{highlight(code)}</code>
        </pre>
        {copy && !title && !lang ? <CopyButton value={code} label="" className="absolute top-1.5 right-1.5 bg-canvas px-1.5" /> : null}
      </div>
    </div>
  );
}
