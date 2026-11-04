"use client";

import { useAction } from "convex/react";
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
 */
export function useFund() {
  const as = useAs();
  const start = useAction(api.taskMoney.startFunding);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });

  const fund = useCallback(
    async (taskId: Id<"tasks">) => {
      setState({ busy: true });
      try {
        const { approveUrl } = await start({
          taskId,
          as,
          origin: window.location.origin,
          hour: new Date().getHours(),
        });
        window.location.assign(approveUrl);
      } catch (err) {
        setState({ busy: false, error: errorMessage(err) });
      }
    },
    [start, as],
  );

  return { fund, ...state };
}
