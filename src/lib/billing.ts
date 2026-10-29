import { supabase } from "./supabase";

// The paywall is off unless VITE_BILLING_ENABLED=true, so the frontend can
// ship before the subscriptions migration and Stripe Edge Functions are
// deployed without locking every user out.
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === "true";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export interface Subscription {
  status: SubscriptionStatus | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  has_used_trial: boolean;
}

// past_due keeps access while Stripe retries the card; it becomes
// unpaid/canceled (and loses access) if retries run out.
const ACCESS_STATUSES = new Set<SubscriptionStatus>(["trialing", "active", "past_due"]);

export function hasAccess(subscription: Subscription | null) {
  return !!subscription?.status && ACCESS_STATUSES.has(subscription.status);
}

// subscriptions is RLS-scoped to auth.uid() and written only by the
// stripe-checkout / stripe-webhook Edge Functions.
export async function getSubscription(): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, trial_end, current_period_end, cancel_at_period_end, has_used_trial")
    .maybeSingle();
  if (error) {
    console.error("Failed to load subscription:", error);
    return null;
  }
  return data;
}

async function redirectFromBillingFunction(action: "checkout" | "portal") {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", { body: { action } });
  if (error) {
    // FunctionsHttpError keeps the JSON body on .context; surface its message.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  if (!data?.url) throw new Error("Billing service didn't return a URL");
  window.location.assign(data.url);
}

export function startCheckout() {
  return redirectFromBillingFunction("checkout");
}

export function openBillingPortal() {
  return redirectFromBillingFunction("portal");
}
