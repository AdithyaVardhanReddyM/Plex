"use client";

import { useAction, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@/lib/convex";
import type { Id } from "@/lib/convex";
import { errorMessage } from "./task-ui";
import { useAs } from "./persona";

/**
 * Starts PayPal funding for a draft: the policy engine checks the pot, a
 * receipt is written, a sandbox order (intent AUTHORIZE) is created, and the
 * browser goes to PayPal to approve it. PayPal returns to
 * /tasks/[id]?paypal=return, where the task page authorizes the order.
 * With auto-pay on (and inside its limits) the hold is placed from the saved
 * PayPal wallet instead, with no redirect.
 */
export function useFund() {
  const as = useAs();
  const start = useAction(api.taskMoney.startFunding);
  const [state, setState] = useState<{ busy: boolean; error?: string; note?: string }>({ busy: false });

  const fund = useCallback(
    async (taskId: Id<"tasks">): Promise<boolean> => {
      setState({ busy: true });
      try {
        const r = await start({
          taskId,
          as,
          origin: window.location.origin,
          hour: new Date().getHours(),
        });
        if (r.autoPaid) {
          setState({ busy: false, note: r.note });
          return true;
        }
        window.location.assign(r.approveUrl);
      } catch (err) {
        setState({ busy: false, error: errorMessage(err) });
      }
      return false;
    },
    [start, as],
  );

  return { fund, ...state };
}

/** Whether this amount would be held by auto-pay (no popup). The server decides again. */
export function useAutoPay(cents: number, outcome?: string) {
  const as = useAs();
  const a = useQuery(api.autopay.mine, { as });
  const on =
    a?.status === "active" &&
    cents > 0 &&
    cents <= a.limitCents &&
    a.usedTodayCents + cents <= a.dailyLimitCents &&
    outcome !== "needs_approval" &&
    outcome !== "deny";
  return { on, payerEmail: a?.status === "active" ? a.payerEmail : undefined };
}
