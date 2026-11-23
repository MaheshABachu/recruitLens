// Plans, prices, trial length and the donation share. No imports, so the
// Node scripts (scripts/send-trial-reminders.ts) can use it too; the app
// imports it through billing.ts.

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
export const DONATION_SHARE = 0.25;
export const CHARITY = {
  name: "Rooted Immigrant Collective",
  url: "https://rootedimmigrantcollective.carrd.co/",
};
