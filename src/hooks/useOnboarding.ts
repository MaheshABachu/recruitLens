import { useCallback, useEffect, useState } from "react";
import { getHasOnboarded, markOnboarded } from "../lib/onboarding";

const storageKey = (userId: string) => `vantage-onboarded:${userId}`;

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
    // Storage blocked (private mode etc.) — the profiles row still records it.
  }
}

// Runs the onboarding tour once per account: shows it automatically when the
// user's profiles.onboarded_at is null, and records it when they finish or skip.
// The localStorage flag only stops a failed save from re-showing it on this browser.
// Pass null while the user can't see the app (signed out, paywalled).
export function useOnboarding(userId: string | null) {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    setShowTour(false);
    if (!userId || readLocalFlag(userId)) return;
    let cancelled = false;
    getHasOnboarded().then((hasOnboarded) => {
      if (!cancelled && hasOnboarded === false) setShowTour(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const startTour = useCallback(() => setShowTour(true), []);

  const finishTour = useCallback(() => {
    setShowTour(false);
    if (!userId) return;
    writeLocalFlag(userId);
    void markOnboarded(userId);
  }, [userId]);

  return { showTour, startTour, finishTour };
}
