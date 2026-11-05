import { useState } from "react";
import {
  CHARITY,
  DONATION_SHARE,
  PLANS,
  formatPerMonth,
  planSavingsPercent,
  startCheckout,
  type PlanId,
  type Subscription,
} from "../../lib/billing";
import { ThemeToggle } from "../layout/ThemeToggle";
import { Logo } from "../shared/Logo";

interface PaywallProps {
  subscription: Subscription | null;
  confirmingCheckout: boolean;
  userEmail: string | undefined;
  onSignOut: () => void;
  // Set when opened from the account menu during the free trial: the user
  // can still go back to the app.
  onClose?: () => void;
  trialEnd?: Date | null;
}

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// Shown to signed-in users once their free trial is over and they have no
// trialing/active subscription (when BILLING_ENABLED), or on demand from the
// account menu during the trial. Reuses the landing page's plan card styles.
export function Paywall({ subscription, confirmingCheckout, userEmail, onSignOut, onClose, trialEnd }: PaywallProps) {
  const [plan, setPlan] = useState<PlanId>("monthly");
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lapsed = subscription?.status != null;
  const selected = PLANS.find((p) => p.id === plan) ?? PLANS[0];

  async function handleCheckout() {
    setError(null);
    setRedirecting(true);
    try {
      await startCheckout(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout. Try again.");
      setRedirecting(false);
    }
  }

  const title = onClose
    ? "Choose your plan."
    : lapsed
      ? "Your subscription has ended."
      : "Your free trial has ended.";

  return (
    <div className="landing paywall">
      <header className="landing__nav">
        <Logo />
        <div className="landing__nav-actions">
          <ThemeToggle />
          {onClose ? (
            <button type="button" className="landing-btn landing-btn--ghost" onClick={onClose}>
              Back to app
            </button>
          ) : (
            <button type="button" className="landing-btn landing-btn--ghost" onClick={onSignOut}>
              Sign out
            </button>
          )}
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
            <h1 className="landing-pricing__title">{title}</h1>
            {onClose && trialEnd ? (
              <p className="paywall__lede">Your free trial runs until {formatDay(trialEnd)}. Subscribe anytime.</p>
            ) : (
              userEmail && <p className="paywall__lede">Signed in as {userEmail}</p>
            )}
            <div className="landing-plan">
              <div className="plan-picker" role="radiogroup" aria-label="Billing plan">
                {PLANS.map((p) => {
                  const savings = planSavingsPercent(p);
                  return (
                    <label key={p.id} className={`plan-picker__option${p.id === plan ? " plan-picker__option--active" : ""}`}>
                      <input
                        type="radio"
                        name="plan"
                        value={p.id}
                        checked={p.id === plan}
                        onChange={() => setPlan(p.id)}
                      />
                      <span className="plan-picker__label">{p.label}</span>
                      <span className="plan-picker__price">${p.price}</span>
                      <span className="plan-picker__meta">
                        {p.months > 1 ? formatPerMonth(p) : p.period}
                        {savings > 0 && <span className="plan-picker__save">Save {savings}%</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
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
                {redirecting ? "Opening checkout…" : `Subscribe for $${selected.price} ${selected.period}`}
              </button>
              {error && (
                <p className="paywall__error" role="alert">
                  {error}
                </p>
              )}
              <p className="landing-plan__fine">Renews automatically. Cancel anytime.</p>
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
