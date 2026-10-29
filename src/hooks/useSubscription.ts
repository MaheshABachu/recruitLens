import { useEffect, useState } from "react";
import { getSubscription, hasAccess, type Subscription } from "../lib/billing";

const CHECKOUT_POLL_MS = 2000;
const CHECKOUT_POLL_TRIES = 15;

// Pass null to disable (billing off, or signed out) — returns no access and
// never fetches.
//
// After Stripe Checkout redirects back with ?checkout=success, the webhook
// that writes the subscriptions row can land a few seconds later, so this
// polls until access appears (or gives up after ~30s) before showing the app.
export function useSubscription(userId: string | null) {
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

  const loading = userId !== null && loadedFor !== userId;
  return { subscription, hasAccess: !loading && hasAccess(subscription), loading, confirmingCheckout };
}
