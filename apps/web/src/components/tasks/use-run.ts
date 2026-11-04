"use client";

import { useCallback, useState } from "react";
import { errorMessage } from "./task-ui";

/** Wraps an async call with busy and error state, keyed so one screen can run several. */
export function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError({ key, message: errorMessage(err) });
      return false;
    } finally {
      setBusy(null);
    }
  }, []);
  return { run, busy, error, errorFor: (key: string) => (error?.key === key ? error.message : undefined) };
}
