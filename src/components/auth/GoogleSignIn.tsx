import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { GoogleIcon } from "../shared/GoogleIcon";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
// How long to wait for the GIS script before falling back to the redirect flow
// (it can be blocked by an extension or a flaky network).
const SCRIPT_TIMEOUT_MS = 8000;

type Status = "loading" | "ready" | "fallback";

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Resolves once window.google.accounts.id exists; rejects if the script errors
// or doesn't load in time. Handles the script having loaded already.
function waitForGis(): { promise: Promise<void>; cancel: () => void } {
  let cleanup = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const script = document.getElementById("gis");
    if (!script) return reject(new Error("GIS script tag missing"));
    const onLoad = () => (window.google?.accounts?.id ? resolve() : reject(new Error("GIS failed to initialise")));
    const onError = () => reject(new Error("GIS script failed to load"));
    const timer = window.setTimeout(() => reject(new Error("GIS script timed out")), SCRIPT_TIMEOUT_MS);
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    cleanup = () => {
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
  });
  promise.then(cleanup, cleanup);
  return { promise, cancel: cleanup };
}

interface GoogleSignInProps {
  mode: "sign-in" | "sign-up";
}

// Google sign-in via Google Identity Services + supabase.auth.signInWithIdToken,
// so Google's account chooser names our domain rather than the Supabase project.
// The session lands through AuthContext's onAuthStateChange like any other
// sign-in. Falls back to the old redirect flow when VITE_GOOGLE_CLIENT_ID is
// unset or the GIS script can't load.
export function GoogleSignIn({ mode }: GoogleSignInProps) {
  const { signInWithGoogle } = useAuth();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>(CLIENT_ID ? "loading" : "fallback");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped after a failed attempt: a nonce is single-use, so re-initialise.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let active = true;
    const gis = waitForGis();

    (async () => {
      try {
        await gis.promise;
      } catch {
        if (active) setStatus("fallback");
        return;
      }
      const nonce = randomNonce();
      const hashedNonce = await sha256Hex(nonce);
      if (!active || !containerRef.current) return;

      const id = window.google!.accounts.id;
      id.initialize({
        client_id: CLIENT_ID,
        nonce: hashedNonce,
        use_fedcm_for_prompt: true,
        callback: async ({ credential }) => {
          if (!active) return;
          setError(null);
          setBusy(true);
          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: credential,
            nonce,
          });
          if (!active) return;
          setBusy(false);
          if (signInError) {
            setError(signInError.message || "Google sign-in failed. Try again.");
            setAttempt((n) => n + 1);
          }
        },
      });
      const width = Math.min(400, Math.max(200, containerRef.current.offsetWidth || 320));
      containerRef.current.replaceChildren();
      id.renderButton(containerRef.current, {
        type: "standard",
        theme: theme === "dark" ? "filled_black" : "outline",
        size: "large",
        shape: "pill",
        text: mode === "sign-up" ? "signup_with" : "signin_with",
        logo_alignment: "left",
        width,
      });
      setStatus("ready");
    })();

    return () => {
      active = false;
      gis.cancel();
      window.google?.accounts?.id?.cancel();
    };
  }, [mode, theme, attempt]);

  if (status === "fallback") {
    return (
      <button type="button" className="landing-btn landing-btn--ghost landing-btn--block" onClick={signInWithGoogle}>
        <GoogleIcon />
        Continue with Google
      </button>
    );
  }

  return (
    <div className="google-signin">
      <div
        ref={containerRef}
        className="google-signin__button"
        aria-busy={status === "loading" || busy}
        style={busy ? { opacity: 0.6, pointerEvents: "none" } : undefined}
      />
      {error && (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
