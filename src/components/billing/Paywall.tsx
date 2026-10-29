import { useState } from "react";
import {
  CHARITY,
  DONATION_SHARE,
  FREE_TRIAL_DAYS,
  PRICE_MONTHLY,
  startCheckout,
  type Subscription,
} from "../../lib/billing";
import { ThemeToggle } from "../layout/ThemeToggle";
import { Logo } from "../shared/Logo";

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
        <Logo />
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
                <span className="landing-plan__amount">${PRICE_MONTHLY}</span>
                <span className="landing-plan__period">per month</span>
              </div>
              {trialAvailable && <p className="landing-plan__trial">Your first {FREE_TRIAL_DAYS} days are free.</p>}
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
                {redirecting
                  ? "Opening checkout…"
                  : trialAvailable
                    ? "Start your free week"
                    : `Subscribe for $${PRICE_MONTHLY}/month`}
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
              <p className="landing-plan__fine">
                {DONATION_SHARE * 100}% of revenue goes to{" "}
                <a href={CHARITY.url} target="_blank" rel="noreferrer">
                  {CHARITY.name}
                </a>
                .
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
