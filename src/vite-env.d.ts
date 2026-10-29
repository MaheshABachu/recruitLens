/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // "true" turns on the Stripe paywall — see src/lib/billing.ts.
  readonly VITE_BILLING_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
