/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // "true" turns on the Stripe paywall — see src/lib/billing.ts.
  readonly VITE_BILLING_ENABLED?: string;
  // Logo.dev publishable token (pk_…) — enables company logos, see src/lib/companyLogos.ts.
  readonly VITE_LOGO_DEV_TOKEN?: string;
  // Google OAuth Web client ID (same one set on Supabase's Google provider) —
  // enables GIS sign-in, see src/components/auth/GoogleSignIn.tsx.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal typing for the parts of Google Identity Services we use.
interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: { credential: string; select_by?: string }) => void;
  nonce?: string;
  use_fedcm_for_prompt?: boolean;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
  locale?: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleIdConfiguration) => void;
        renderButton: (parent: HTMLElement, options: GoogleButtonConfiguration) => void;
        prompt: () => void;
        cancel: () => void;
        disableAutoSelect: () => void;
      };
    };
  };
}
