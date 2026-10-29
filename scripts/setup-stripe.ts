// One-time Stripe setup: run `npm run setup:stripe` after putting
// STRIPE_SECRET_KEY in .env.local. Safe to re-run — each step reuses what
// already exists. Creates, in whichever Stripe mode the key belongs to
// (sk_test_ → test, sk_live_ → live):
//   1. the "Vantage" product + $5/month price (lookup key vantage_monthly,
//      which the stripe-checkout Edge Function looks up)
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
const PRICE_LOOKUP_KEY = "vantage_monthly";
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

async function ensurePrice() {
  const existing = await stripe<List<{ id: string }>>("GET", "/prices", {
    "lookup_keys[]": PRICE_LOOKUP_KEY,
    active: true,
  });
  if (existing.data[0]) {
    console.log(`✓ Price exists: ${existing.data[0].id}`);
    return;
  }
  const product = await stripe<{ id: string }>("POST", "/products", {
    name: "Vantage",
    description: "Company-tagged interview questions and a merged new-grad job feed.",
  });
  const price = await stripe<{ id: string }>("POST", "/prices", {
    product: product.id,
    currency: "usd",
    unit_amount: 500,
    "recurring[interval]": "month",
    lookup_key: PRICE_LOOKUP_KEY,
  });
  console.log(`✓ Created product ${product.id} and $5/month price ${price.id}`);
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
  await ensurePrice();
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
