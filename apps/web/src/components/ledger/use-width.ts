"use client";

import { useEffect, useRef, useState } from "react";

/** The live width of an element, for grids that pick their columns by the space they have. */
export function useWidth<T extends HTMLElement>(initial = 1000) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? initial)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, width] as const;
}
