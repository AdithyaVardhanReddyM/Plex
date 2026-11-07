"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Copies `value`; the icon turns into a check for a moment. `onDark` for the ink code panels. */
export function CopyButton({
  value,
  label = "Copy",
  onDark,
  className,
}: {
  value: string;
  label?: string;
  onDark?: boolean;
  className?: string;
}) {
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
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors [&_svg]:size-3.5 [&_svg]:stroke-[1.9]",
        onDark ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-sunken hover:text-ink",
        copied && (onDark ? "text-green-300 hover:text-green-300" : "text-green-700 hover:text-green-700"),
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
 * Syntax colour for JSON and shell on ink: keys in pale steel, strings in mint,
 * flags in white, $VARS in aqua, the rest dim. React nodes only, never injected HTML.
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
        <span key={i++} className={m[2] ? "text-steel-200" : "text-green-200"}>
          {m[1]}
        </span>,
      );
      if (m[2]) out.push(m[2]);
    } else if (m[3]) {
      out.push(
        <span key={i++} className="text-white">
          {m[3]}
        </span>,
      );
    } else if (m[4]) {
      out.push(
        <span key={i++} className="text-green-400">
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
 * A code sample on an ink panel: a quiet label row (language, title, copy) on
 * the same surface, no strip. Without `title` or `lang` it renders bare, for
 * small request bodies inside a row.
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
  const bare = !title && !lang;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[14px] bg-night-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),0_12px_28px_-18px_rgb(8_16_14/0.6)]",
        className,
      )}
    >
      {!bare ? (
        <div className="flex h-10 items-center justify-between gap-3 pt-1 pr-1.5 pl-4">
          <div className="flex min-w-0 items-center gap-2.5 text-[12.5px] font-medium text-white/70">
            {lang ? <span className="font-mono text-[11px] text-green-300/80">{lang}</span> : null}
            <span className="truncate">{title}</span>
          </div>
          {copy ? <CopyButton value={code} onDark /> : null}
        </div>
      ) : null}
      <div className="relative">
        <pre
          className={cn(
            "overflow-x-auto px-4 font-mono text-[12.5px] leading-[1.7] text-white/60 [scrollbar-color:rgb(255_255_255/0.15)_transparent]",
            bare ? "py-3" : "pt-1 pb-4",
            copy && bare && "pr-12",
            bodyClassName,
          )}
        >
          <code>{highlight(code)}</code>
        </pre>
        {copy && bare ? <CopyButton value={code} label="" onDark className="absolute top-1.5 right-1.5 px-1.5" /> : null}
      </div>
    </div>
  );
}
