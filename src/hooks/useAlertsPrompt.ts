import { useCallback, useEffect, useState } from "react";
import { getAlertsPrompted, markAlertsPrompted } from "../lib/alerts";

export type AlertsPromptStatus = "loading" | "show" | "hidden";

const storageKey = (userId: string) => `vantage-alerts-prompted:${userId}`;

function readLocalFlag(userId: string) {
  try {
    return localStorage.getItem(storageKey(userId)) !== null;
  } catch {
    return false;
  }
}

function writeLocalFlag(userId: string) {
  try {
    localStorage.setItem(storageKey(userId), "1");
  } catch {
    // Storage blocked — profiles.alerts_prompted_at still records it.
  }
}

// Shows the job-alerts intake once per account: "show" while
// profiles.alerts_prompted_at is null, "hidden" once it's set (finish or skip
// both call dismiss). Same localStorage backstop as useOnboarding, which also
// means returning users on this browser skip the lookup entirely.
// Pass null while the user can't see the app (signed out, paywalled).
export function useAlertsPrompt(userId: string | null) {
  // Keyed by user so a stale answer for another account is never used.
  const [answer, setAnswer] = useState<{ userId: string; show: boolean } | null>(null);

  useEffect(() => {
    if (!userId || readLocalFlag(userId)) return;
    let cancelled = false;
    getAlertsPrompted().then((prompted) => {
      // null = couldn't tell: don't show.
      if (!cancelled) setAnswer({ userId, show: prompted === false });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  let status: AlertsPromptStatus;
  if (!userId || readLocalFlag(userId)) status = "hidden";
  else if (answer?.userId !== userId) status = "loading";
  else status = answer.show ? "show" : "hidden";

  const dismiss = useCallback(() => {
    if (!userId) return;
    writeLocalFlag(userId);
    setAnswer({ userId, show: false });
    void markAlertsPrompted(userId);
  }, [userId]);

  return { status, dismiss };
}
