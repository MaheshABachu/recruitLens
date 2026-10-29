import Stripe from "npm:stripe@17.7.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Shared by stripe-checkout and stripe-webhook.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets, or
// `supabase secrets set`): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

// scripts/setup-stripe.ts creates the $5/month price under this lookup key.
// If it doesn't exist yet, checkout falls back to an inline price so the flow
// still works end to end.
export const PRICE_LOOKUP_KEY = "vantage_monthly";
export const FALLBACK_PRICE = { currency: "usd", unit_amount: 500, product_name: "Vantage" };
export const TRIAL_DAYS = 7;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getStripe(): Stripe | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export function getServiceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function toIso(unixSeconds: number | null | undefined) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

// Mirrors a Stripe subscription onto the subscriptions row. Webhook payloads
// on newer Stripe API versions moved current_period_end onto the subscription
// item, so read it from either place.
export function subscriptionRowFields(sub: Stripe.Subscription) {
  // deno-lint-ignore no-explicit-any
  const loose = sub as any;
  const item = sub.items?.data?.[0];
  return {
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_id: item?.price?.id ?? null,
    trial_end: toIso(sub.trial_end),
    // deno-lint-ignore no-explicit-any
    current_period_end: toIso(loose.current_period_end ?? (item as any)?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    has_used_trial: true,
    updated_at: new Date().toISOString(),
  };
}
