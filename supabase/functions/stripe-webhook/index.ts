import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { getServiceClient, getStripe, jsonResponse, subscriptionRowFields } from "../_shared/billing.ts";

// Stripe → Supabase sync for the subscriptions table. Stripe calls this, not
// a signed-in user, so it MUST be deployed with verify_jwt: false
// (`supabase functions deploy stripe-webhook --no-verify-jwt`). Authenticity
// comes from the Stripe-Signature header checked against STRIPE_WEBHOOK_SECRET.

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

Deno.serve(async (req) => {
  const stripe = getStripe();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripe || !webhookSecret) {
    return jsonResponse({ error: "Billing isn't set up yet: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET missing." }, 503);
  }

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) return jsonResponse({ error: "Missing Stripe-Signature" }, 400);

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return jsonResponse({ error: "Invalid signature" }, 400);
  }

  const supabase = getServiceClient();

  try {
    let subscriptionId: string | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && typeof session.subscription === "string") {
        subscriptionId = session.subscription;
      }
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    }

    if (!subscriptionId) return jsonResponse({ received: true, ignored: event.type });

    // Re-fetch rather than trusting the event payload: Stripe doesn't
    // guarantee delivery order, so an older "updated" event arriving late
    // would otherwise overwrite a newer status.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const fields = subscriptionRowFields(subscription);

    // Prefer the user id stamped on the subscription at checkout; fall back to
    // the customer → user mapping written when the customer was created.
    let userId: string | null = subscription.metadata?.user_id ?? null;
    if (!userId) {
      const { data } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", fields.stripe_customer_id)
        .maybeSingle();
      userId = data?.user_id ?? null;
    }
    if (!userId) {
      console.warn(`No user for Stripe customer ${fields.stripe_customer_id} (${event.type})`);
      return jsonResponse({ received: true, unmatched: true });
    }

    const { error } = await supabase
      .from("subscriptions")
      .upsert({ user_id: userId, ...fields }, { onConflict: "user_id" });
    if (error) throw error;

    return jsonResponse({ received: true });
  } catch (err) {
    console.error(`stripe-webhook failed on ${event.type}:`, err);
    // 500 makes Stripe retry the delivery.
    return jsonResponse({ error: "Webhook handler failed" }, 500);
  }
});
