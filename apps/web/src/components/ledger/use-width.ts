"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The live width of an element, for grids that pick their columns by the space
 * they have. Null until measured (before first paint), so a grid can mount
 * with the right columns instead of reflowing.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure now, then follow resizes (an observer's first report can be
    // delayed while the tab is in the background).
    const measure = (w: number) => setWidth(Math.round(w));
    measure(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => measure(e?.contentRect.width ?? el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
