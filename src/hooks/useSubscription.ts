import { useEffect, useMemo, useState } from "react";
import { getSubscription, hasAccess, trialEndsAt, type Subscription } from "../lib/billing";

const CHECKOUT_POLL_MS = 2000;
const CHECKOUT_POLL_TRIES = 15;

// accountCreatedAt starts the in-app free trial (FREE_TRIAL_DAYS): access
// until it ends even with no subscription, then the paywall.
//
// Pass null to disable (billing off, or signed out) — returns no access and
// never fetches.
//
// After Stripe Checkout redirects back with ?checkout=success, the webhook
// that writes the subscriptions row can land a few seconds later, so this
// polls until access appears (or gives up after ~30s) before showing the app.
export function useSubscription(userId: string | null, accountCreatedAt?: string) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // Which user the current `subscription` belongs to. Deriving `loading` from
  // this (instead of a flag set inside the effect) means there's no render
  // between "userId arrived" and "fetch started" where we'd report no access
  // and flash the paywall.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSubscription(null);
      setLoadedFor(null);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const params = new URLSearchParams(window.location.search);
    const shouldPoll = params.get("checkout") === "success";
    if (params.has("checkout")) {
      params.delete("checkout");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }

    async function load(triesLeft: number) {
      const next = await getSubscription();
      if (cancelled) return;
      setSubscription(next);
      if (shouldPoll && !hasAccess(next) && triesLeft > 0) {
        setConfirmingCheckout(true);
        timer = window.setTimeout(() => load(triesLeft - 1), CHECKOUT_POLL_MS);
        return;
      }
      setConfirmingCheckout(false);
      setLoadedFor(userId);
    }

    load(CHECKOUT_POLL_TRIES);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  const trialEnd = useMemo(() => trialEndsAt(accountCreatedAt), [accountCreatedAt]);
  const [trialActive, setTrialActive] = useState(() => !!trialEnd && trialEnd.getTime() > Date.now());

  // Flip to the paywall the moment the trial runs out, not on next reload.
  useEffect(() => {
    const remaining = trialEnd ? trialEnd.getTime() - Date.now() : 0;
    setTrialActive(remaining > 0);
    // setTimeout overflows past ~24.8 days; a trial is far shorter.
    if (remaining <= 0 || remaining > 2 ** 31 - 1) return;
    const timer = window.setTimeout(() => setTrialActive(false), remaining);
    return () => window.clearTimeout(timer);
  }, [trialEnd]);

  const loading = userId !== null && loadedFor !== userId;
  const subscribed = hasAccess(subscription);
  return {
    subscription,
    // Trial access doesn't wait on the subscription fetch.
    hasAccess: (userId !== null && trialActive) || (!loading && subscribed),
    // Still in the free trial with no subscription — the account menu offers plans.
    inFreeTrial: trialActive && !subscribed,
    trialEnd,
    loading,
    confirmingCheckout,
  };
}
