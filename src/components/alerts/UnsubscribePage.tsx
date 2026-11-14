import { useState } from "react";
import { LEGAL } from "../../lib/legal";
import { ThemeToggle } from "../layout/ThemeToggle";
import { Logo } from "../shared/Logo";

type State = "confirm" | "working" | "done" | "error";

// /unsubscribe?token=… — the footer link in job-alert emails. Works signed
// out: the token is the credential. Needs a click (no auto-submit on load) so
// link scanners can't unsubscribe anyone; mail clients' one-click unsubscribe
// calls the alerts-unsubscribe Edge Function directly instead.
export function UnsubscribePage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [state, setState] = useState<State>(token ? "confirm" : "error");
  const [error, setError] = useState<string | null>(token ? null : "This unsubscribe link is missing its token.");

  async function unsubscribe() {
    setState("working");
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alerts-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) return setState("done");
      const body = await res.json().catch(() => null);
      setError(typeof body?.error === "string" ? body.error : "Couldn't unsubscribe. Try again.");
      setState("error");
    } catch {
      setError("Couldn't reach the server. Try again.");
      setState("error");
    }
  }

  return (
    <div className="landing auth-screen">
      <header className="landing__nav">
        <a href="/" aria-label={`${LEGAL.serviceName} home`}>
          <Logo />
        </a>
        <div className="landing__nav-actions">
          <ThemeToggle />
        </div>
      </header>
      <main className="auth-screen__body">
        <div className="auth-screen__card auth-form" role={state === "done" ? "status" : undefined}>
          {state === "done" ? (
            <>
              <h1 className="auth-form__title">You're unsubscribed</h1>
              <p className="auth-form__lede">
                You won't get job alert emails anymore. Changed your mind? Turn them back on from Job alerts in the
                account menu.
              </p>
              <a className="landing-btn landing-btn--ghost landing-btn--block" href="/?alerts=1" style={{ marginTop: 24 }}>
                Manage alerts
              </a>
            </>
          ) : (
            <>
              <h1 className="auth-form__title">Unsubscribe from job alerts?</h1>
              <p className="auth-form__lede">
                We'll stop emailing you new postings. Your saved alert settings stay, so you can turn them back on
                anytime.
              </p>
              {error && (
                <p className="auth-form__error" role="alert" style={{ marginTop: 16 }}>
                  {error}
                </p>
              )}
              {token && (
                <button
                  type="button"
                  className="landing-btn landing-btn--primary landing-btn--block"
                  style={{ marginTop: 24 }}
                  onClick={unsubscribe}
                  disabled={state === "working"}
                >
                  {state === "working" ? "Unsubscribing…" : "Unsubscribe"}
                </button>
              )}
              <a className="auth-form__link" href="/?alerts=1" style={{ display: "inline-block", marginTop: 16 }}>
                Change what I get instead
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
