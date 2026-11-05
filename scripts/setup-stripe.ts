// One-time Stripe setup: run `npm run setup:stripe` after putting
// STRIPE_SECRET_KEY in .env.local. Safe to re-run — each step reuses what
// already exists. Creates, in whichever Stripe mode the key belongs to
// (sk_test_ → test, sk_live_ → live):
//   1. the "Vantage" product + one price per plan (PLANS below: $7/month,
//      $15/3 months, $50/year, under lookup keys the stripe-checkout Edge
//      Function looks up). Stripe prices are immutable, so changing a plan's
//      cents or interval creates a new price, moves the lookup key onto it and
//      archives the old one. Existing subscribers stay on the price they
//      signed up at.
//   2. a webhook endpoint pointing at the stripe-webhook Edge Function, and
//      saves its signing secret to .env.local as STRIPE_WEBHOOK_SECRET
//   3. a Billing Portal configuration (update card, cancel, invoices)
// Then prints the `supabase secrets set` command to finish.
//
// Talks to Stripe's REST API with fetch, so there's no stripe npm dependency.

import { appendFileSync, readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const STRIPE_API = "https://api.stripe.com/v1";
// Keep in sync with PLANS in src/lib/billing.ts and
// supabase/functions/_shared/billing.ts.
const PLANS = [
  { lookupKey: "vantage_monthly", cents: 700, intervalCount: 1, label: "$7/month" },
  { lookupKey: "vantage_quarterly", cents: 1500, intervalCount: 3, label: "$15/3 months" },
  { lookupKey: "vantage_yearly", cents: 5000, intervalCount: 12, label: "$50/year" },
];
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
];

const secretKey = process.env.STRIPE_SECRET_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
if (!secretKey || !supabaseUrl) {
  console.error("STRIPE_SECRET_KEY and VITE_SUPABASE_URL must be set in .env.local");
  process.exit(1);
}
const mode = secretKey.startsWith("sk_live_") ? "LIVE" : "test";
const webhookUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/stripe-webhook`;

type Params = Record<string, string | number | boolean | undefined>;

async function stripe<T>(method: "GET" | "POST", path: string, params: Params = {}): Promise<T> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
  const url = method === "GET" && body.size ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? body : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? res.status}`);
  return json as T;
}

interface List<T> {
  data: T[];
}

interface Price {
  id: string;
  unit_amount: number;
  product: string;
  recurring: { interval: string; interval_count: number } | null;
}

// All plans share one product: reuse the product behind any existing plan
// price, or create it.
async function ensureProduct(): Promise<string> {
  for (const plan of PLANS) {
    const existing = await stripe<List<Price>>("GET", "/prices", { "lookup_keys[]": plan.lookupKey, active: true });
    if (existing.data[0]) return existing.data[0].product;
  }
  const product = await stripe<{ id: string }>("POST", "/products", {
    name: "Vantage",
    description: "Company-tagged interview questions and a merged new-grad job feed.",
  });
  console.log(`✓ Created product ${product.id}`);
  return product.id;
}

async function ensurePrice(plan: (typeof PLANS)[number], productId: string) {
  const existing = await stripe<List<Price>>("GET", "/prices", { "lookup_keys[]": plan.lookupKey, active: true });
  const current = existing.data[0];
  if (
    current?.unit_amount === plan.cents &&
    current.recurring?.interval === "month" &&
    current.recurring.interval_count === plan.intervalCount
  ) {
    console.log(`✓ ${plan.label} price exists: ${current.id}`);
    return;
  }

  const price = await stripe<{ id: string }>("POST", "/prices", {
    product: current?.product ?? productId,
    currency: "usd",
    unit_amount: plan.cents,
    "recurring[interval]": "month",
    "recurring[interval_count]": plan.intervalCount,
    lookup_key: plan.lookupKey,
    transfer_lookup_key: true,
  });
  if (current) {
    // Archiving only stops new checkouts using it; existing subscriptions keep billing.
    await stripe("POST", `/prices/${current.id}`, { active: false });
    console.log(`✓ Created ${plan.label} price ${price.id}, moved the lookup key to it, archived ${current.id}`);
  } else {
    console.log(`✓ Created ${plan.label} price ${price.id}`);
  }
}

async function ensureWebhook(): Promise<string | null> {
  const endpoints = await stripe<List<{ id: string; url: string }>>("GET", "/webhook_endpoints", { limit: 100 });
  const match = endpoints.data.find((e) => e.url === webhookUrl);
  if (match) {
    const saved = readFileSync(".env.local", "utf8").match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m)?.[1]?.trim();
    if (saved) {
      console.log(`✓ Webhook exists: ${match.id} (signing secret already in .env.local)`);
      return saved;
    }
    console.warn(
      `! Webhook ${match.id} already exists, but its signing secret isn't in .env.local and Stripe only ` +
        "reveals it at creation. Copy it from Stripe Dashboard → Developers → Webhooks → that endpoint → " +
        "Signing secret, or delete the endpoint and re-run this script.",
    );
    return null;
  }
  const params: Params = { url: webhookUrl, description: "Vantage → Supabase subscriptions sync" };
  WEBHOOK_EVENTS.forEach((event, i) => (params[`enabled_events[${i}]`] = event));
  const created = await stripe<{ id: string; secret: string }>("POST", "/webhook_endpoints", params);
  appendFileSync(".env.local", `\nSTRIPE_WEBHOOK_SECRET=${created.secret}\n`);
  console.log(`✓ Created webhook ${created.id} → ${webhookUrl}`);
  console.log("  Saved its signing secret to .env.local as STRIPE_WEBHOOK_SECRET");
  return created.secret;
}

async function ensurePortalConfiguration() {
  const configs = await stripe<List<{ id: string }>>("GET", "/billing_portal/configurations", {
    active: true,
    limit: 1,
  });
  if (configs.data[0]) {
    console.log(`✓ Billing portal configuration exists: ${configs.data[0].id}`);
    return;
  }
  const created = await stripe<{ id: string }>("POST", "/billing_portal/configurations", {
    "business_profile[headline]": "Manage your Vantage subscription",
    "features[payment_method_update][enabled]": true,
    "features[invoice_history][enabled]": true,
    "features[subscription_cancel][enabled]": true,
    "features[subscription_cancel][mode]": "at_period_end",
    "features[customer_update][enabled]": true,
    "features[customer_update][allowed_updates][0]": "email",
  });
  console.log(`✓ Created billing portal configuration ${created.id}`);
}

async function main() {
  console.log(`Setting up Stripe (${mode} mode)\n`);
  const productId = await ensureProduct();
  for (const plan of PLANS) await ensurePrice(plan, productId);
  const webhookSecret = await ensureWebhook();
  await ensurePortalConfiguration();

  console.log("\nLast step: give the Edge Functions the keys. Either run");
  console.log(
    `\n  npx supabase secrets set --project-ref sytbbdmrkzfrpqtmioiv STRIPE_SECRET_KEY=<your key> ` +
      `STRIPE_WEBHOOK_SECRET=${webhookSecret ?? "<webhook signing secret>"}\n`,
  );
  console.log("or add both under Supabase Dashboard → Edge Functions → Secrets.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
