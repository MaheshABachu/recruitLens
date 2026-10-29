import { useState } from "react";
import { startCheckout, type Subscription } from "../../lib/billing";
import { ThemeToggle } from "../layout/ThemeToggle";

interface PaywallProps {
  subscription: Subscription | null;
  confirmingCheckout: boolean;
  userEmail: string | undefined;
  onSignOut: () => void;
}

// Shown to signed-in users without a trialing/active subscription when
// BILLING_ENABLED. Reuses the landing page's plan card styles.
export function Paywall({ subscription, confirmingCheckout, userEmail, onSignOut }: PaywallProps) {
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trialAvailable = !subscription?.has_used_trial;
  const lapsed = subscription?.status != null;

  async function handleCheckout() {
    setError(null);
    setRedirecting(true);
    try {
      await startCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout. Try again.");
      setRedirecting(false);
    }
  }

  return (
    <div className="landing paywall">
      <header className="landing__nav">
        <div className="logo">
          <span className="logo__mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="logo__text">
            Van<span className="logo__accent">tage</span>
          </span>
        </div>
        <div className="landing__nav-actions">
          <ThemeToggle />
          <button type="button" className="landing-btn landing-btn--ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="landing-pricing paywall__body">
        {confirmingCheckout ? (
          <div className="paywall__confirming" role="status">
            <h1 className="landing-pricing__title">Setting up your account…</h1>
            <p className="paywall__lede">This takes a few seconds after checkout.</p>
          </div>
        ) : (
          <>
            <h1 className="landing-pricing__title">
              {lapsed ? "Your subscription has ended." : trialAvailable ? "Start your free week." : "Pick up where you left off."}
            </h1>
            {userEmail && <p className="paywall__lede">Signed in as {userEmail}</p>}
            <div className="landing-plan">
              <div className="landing-plan__price">
                <span className="landing-plan__amount">$5</span>
                <span className="landing-plan__period">per month</span>
              </div>
              {trialAvailable && <p className="landing-plan__trial">Your first 7 days are free.</p>}
              <ul className="landing-list landing-list--plan">
                <li>Company-tagged questions for 470 companies</li>
                <li>Frequency by time window and topic filters</li>
                <li>Automatic solved tracking from your LeetCode account</li>
                <li>The merged new-grad job feed, updated daily</li>
              </ul>
              <button
                type="button"
                className="landing-btn landing-btn--primary landing-btn--block"
                onClick={handleCheckout}
                disabled={redirecting}
              >
                {redirecting ? "Opening checkout…" : trialAvailable ? "Start your free week" : "Subscribe for $5/month"}
              </button>
              {error && (
                <p className="paywall__error" role="alert">
                  {error}
                </p>
              )}
              <p className="landing-plan__fine">
                {trialAvailable
                  ? "You won't be charged until your free week ends. Cancel anytime."
                  : "Cancel anytime."}
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
