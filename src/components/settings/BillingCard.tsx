import { useState } from "react";
import { openBillingPortal, type Subscription } from "../../lib/billing";

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
}

function statusLine(subscription: Subscription | null) {
  if (!subscription?.status) return "No subscription";
  const periodEnd = formatDate(subscription.current_period_end);
  if (subscription.status === "trialing") {
    const trialEnd = formatDate(subscription.trial_end);
    return subscription.cancel_at_period_end
      ? `Free trial ends ${trialEnd}, then cancels`
      : `Free trial until ${trialEnd}, then $5/month`;
  }
  if (subscription.status === "past_due") return "Payment failed. Update your card to keep access.";
  if (subscription.cancel_at_period_end) return `Cancels on ${periodEnd}`;
  if (subscription.status === "active") return `$5/month, renews ${periodEnd}`;
  return `Subscription ${subscription.status.replace("_", " ")}`;
}

export function BillingCard({ subscription }: { subscription: Subscription | null }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleManage() {
    setError(null);
    setOpening(true);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open billing. Try again.");
      setOpening(false);
    }
  }

  return (
    <div className="billing-card">
      <p className="billing-card__status">{statusLine(subscription)}</p>
      {subscription?.status && (
        <button
          type="button"
          className="leetcode-card__primary-button"
          onClick={handleManage}
          disabled={opening}
        >
          {opening ? "Opening…" : "Manage billing"}
        </button>
      )}
      {error && (
        <p className="billing-card__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
