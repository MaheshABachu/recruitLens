import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getServiceClient, getStripe, jsonResponse } from "../_shared/billing.ts";

// Permanently deletes the caller's account (account menu → Delete account,
// src/lib/account.ts). Deployed with verify_jwt: true; the user id comes from
// the verified token, never the body.
//
// 1. Cancels any live Stripe subscription immediately, so a deleted account
//    is never billed again. The Stripe customer and invoices are kept for
//    accounting.
// 2. Deletes the auth user. Every user-owned table (profiles,
//    leetcode_account, leetcode_solves, user_companies, subscriptions)
//    references auth.users with on delete cascade.

const LIVE_STATUSES = new Set(["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabase = getServiceClient();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return jsonResponse({ error: "Not authenticated" }, 401);
  const userId = authData.user.id;

  try {
    const { data: row, error: rowError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (rowError) throw rowError;

    if (row?.stripe_customer_id) {
      const stripe = getStripe();
      if (!stripe) {
        // Refuse rather than delete the account and leave billing running.
        return jsonResponse({ error: "Billing is unavailable right now, so we can't cancel your plan. Try again later." }, 503);
      }
      const subscriptions = await stripe.subscriptions.list({
        customer: row.stripe_customer_id,
        status: "all",
        limit: 100,
      });
      for (const sub of subscriptions.data) {
        if (LIVE_STATUSES.has(sub.status)) await stripe.subscriptions.cancel(sub.id);
      }
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return jsonResponse({ deleted: true });
  } catch (err) {
    console.error("delete-account failed:", err);
    return jsonResponse({ error: "Couldn't delete your account. Try again, or contact support." }, 500);
  }
});
