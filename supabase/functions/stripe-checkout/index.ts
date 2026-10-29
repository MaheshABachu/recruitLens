import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  FALLBACK_PRICE,
  PRICE_LOOKUP_KEY,
  TRIAL_DAYS,
  corsHeaders,
  getServiceClient,
  getStripe,
  jsonResponse,
} from "../_shared/billing.ts";

// Called from the frontend via supabase.functions.invoke("stripe-checkout",
// { body: { action } }) — see src/lib/billing.ts.
//   action "checkout" → Stripe Checkout URL for the $5/month plan, with a
//                       7-day trial on the user's first subscription
//   action "portal"   → Stripe Billing Portal URL (update card, cancel)
// Deployed with verify_jwt: true, so the gateway already rejected anonymous
// callers; the user id still comes from the verified token, never the body.

const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stripe = getStripe();
  if (!stripe) {
    return jsonResponse({ error: "Billing isn't set up yet: STRIPE_SECRET_KEY is missing." }, 503);
  }

  const supabase = getServiceClient();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse({ error: "Not authenticated" }, 401);
  const user = authData.user;

  // Return to whichever deployment (localhost, preview, prod) started checkout.
  const origin = req.headers.get("origin") ?? Deno.env.get("SITE_URL") ?? "";
  if (!origin) return jsonResponse({ error: "Missing request origin" }, 400);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === "portal" ? "portal" : "checkout";

    const { data: row } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status, has_used_trial")
      .eq("user_id", user.id)
      .maybeSingle();

    if (action === "portal") {
      if (!row?.stripe_customer_id) return jsonResponse({ error: "No billing account yet" }, 400);
      // scripts/setup-stripe.ts creates a portal configuration via the API,
      // which isn't automatically the account default — pass it explicitly.
      const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 1 });
      const portal = await stripe.billingPortal.sessions.create({
        customer: row.stripe_customer_id,
        return_url: origin,
        ...(configs.data[0] ? { configuration: configs.data[0].id } : {}),
      });
      return jsonResponse({ url: portal.url });
    }

    if (row?.status && ACTIVE_STATUSES.has(row.status)) {
      return jsonResponse({ error: "You already have an active subscription" }, 409);
    }

    let customerId = row?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      const { error } = await supabase
        .from("subscriptions")
        .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
      if (error) throw error;
    }

    const prices = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 });
    const priceId = prices.data[0]?.id;
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: FALLBACK_PRICE.currency,
            unit_amount: FALLBACK_PRICE.unit_amount,
            recurring: { interval: "month" as const },
            product_data: { name: FALLBACK_PRICE.product_name },
          },
        };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [lineItem],
      subscription_data: {
        metadata: { user_id: user.id },
        ...(row?.has_used_trial ? {} : { trial_period_days: TRIAL_DAYS }),
      },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("stripe-checkout failed:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Checkout failed" }, 500);
  }
});
