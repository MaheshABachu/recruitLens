import { supabase } from "./supabase";

// The paywall is off unless VITE_BILLING_ENABLED=true, so the frontend can
// ship before the subscriptions migration and Stripe Edge Functions are
// deployed without locking every user out.
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === "true";

// Display prices. What Stripe actually charges is the price under each plan's
// lookup key (scripts/setup-stripe.ts, supabase/functions/_shared/billing.ts)
// — keep all three in sync.
export type PlanId = "monthly" | "quarterly" | "yearly";

export interface Plan {
  id: PlanId;
  label: string;
  price: number;
  months: number;
  period: string;
}

export const PLANS: Plan[] = [
  { id: "monthly", label: "Monthly", price: 7, months: 1, period: "per month" },
  { id: "quarterly", label: "3 months", price: 15, months: 3, period: "every 3 months" },
  { id: "yearly", label: "Yearly", price: 50, months: 12, period: "per year" },
];

export const PRICE_MONTHLY = PLANS[0].price;

// Free trial, counted from account creation and enforced in the app — no card
// needed. After it ends, users without a subscription see the paywall.
export const FREE_TRIAL_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trialEndsAt(accountCreatedAt: string | undefined): Date | null {
  if (!accountCreatedAt) return null;
  const created = new Date(accountCreatedAt).getTime();
  return Number.isNaN(created) ? null : new Date(created + FREE_TRIAL_DAYS * DAY_MS);
}

// Savings vs. paying monthly for the same stretch, as a whole percent.
export function planSavingsPercent(plan: Plan) {
  const monthlyTotal = PRICE_MONTHLY * plan.months;
  return Math.round(((monthlyTotal - plan.price) / monthlyTotal) * 100);
}

export function formatPerMonth(plan: Plan) {
  const perMonth = plan.price / plan.months;
  return `$${Number.isInteger(perMonth) ? perMonth : perMonth.toFixed(2)}/mo`;
}

// Share of revenue donated, and where it goes.
export const DONATION_SHARE = 0.2;
export const CHARITY = {
  name: "Rooted Immigrant Collective",
  url: "https://rootedimmigrantcollective.carrd.co/",
};

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

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
}

// One-line summary for the account menu. appTrialEnd: the in-app free trial's
// end, shown when there's no Stripe subscription yet.
export function subscriptionStatusLine(subscription: Subscription | null, appTrialEnd: Date | null = null) {
  if (!hasAccess(subscription) && appTrialEnd && appTrialEnd.getTime() > Date.now()) {
    return `Free trial until ${formatDate(appTrialEnd.toISOString())}`;
  }
  if (!subscription?.status) return "No subscription";
  const periodEnd = formatDate(subscription.current_period_end);
  if (subscription.status === "trialing") {
    const trialEnd = formatDate(subscription.trial_end);
    return subscription.cancel_at_period_end
      ? `Free trial ends ${trialEnd}, then cancels`
      : `Free trial until ${trialEnd}, then your plan starts`;
  }
  if (subscription.status === "past_due") return "Payment failed. Update your card to keep access.";
  if (subscription.cancel_at_period_end) return `Cancels on ${periodEnd}`;
  if (subscription.status === "active") return `Renews ${periodEnd}`;
  return `Subscription ${subscription.status.replace("_", " ")}`;
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

async function redirectFromBillingFunction(action: "checkout" | "portal", plan?: PlanId) {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", { body: { action, plan } });
  if (error) {
    // FunctionsHttpError keeps the JSON body on .context; surface its message.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
  if (!data?.url) throw new Error("Billing service didn't return a URL");
  window.location.assign(data.url);
}

export function startCheckout(plan: PlanId) {
  return redirectFromBillingFunction("checkout", plan);
}

export function openBillingPortal() {
  return redirectFromBillingFunction("portal");
}
