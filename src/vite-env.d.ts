/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // "true" turns on the Stripe paywall — see src/lib/billing.ts.
  readonly VITE_BILLING_ENABLED?: string;
  // Logo.dev publishable token (pk_…) — enables company logos, see src/lib/companyLogos.ts.
  readonly VITE_LOGO_DEV_TOKEN?: string;
  // Sentry DSN — turns on error monitoring, see src/lib/monitoring.ts.
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
