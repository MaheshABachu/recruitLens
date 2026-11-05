import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { openBillingPortal, subscriptionStatusLine, type Subscription } from "../../lib/billing";
import type { Theme } from "../../context/ThemeContext";
import { LOGOS_ENABLED } from "../../lib/companyLogos";
import { deleteAccount } from "../../lib/account";

interface AccountMenuProps {
  userEmail: string | null | undefined;
  onSignOut: () => void;
  // undefined when billing is disabled — hides "Manage billing" entirely.
  subscription?: Subscription | null;
  // In-app free trial end (null when not in one) and the "Choose a plan"
  // action shown in place of Manage billing while it runs.
  trialEnd?: Date | null;
  onChoosePlan?: () => void;
  // Replays the onboarding tour.
  onStartTour?: () => void;
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// The avatar in the top-right corner. Opens a dropdown with the theme switch,
// Manage billing (Stripe Billing Portal) and Sign out.
export function AccountMenu({
  userEmail,
  onSignOut,
  subscription,
  trialEnd = null,
  onChoosePlan,
  onStartTour,
}: AccountMenuProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [openingBilling, setOpeningBilling] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      "Delete your Vantage account?\n\nThis permanently deletes your account and data, cancels any subscription " +
        "immediately with no further charges, and can't be undone.",
    );
    if (!confirmed) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  }

  async function handleManageBilling() {
    setBillingError(null);
    setOpeningBilling(true);
    try {
      await openBillingPortal();
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Couldn't open billing. Try again.");
      setOpeningBilling(false);
    }
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="account-btn"
        data-tour="account"
        aria-label="Account"
        aria-expanded={open}
        aria-controls={menuId}
        title={userEmail ?? undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {userEmail?.[0]?.toUpperCase() ?? "?"}
      </button>

      {open && (
        <div id={menuId} className="account-menu__panel">
          {userEmail && <div className="account-menu__email">{userEmail}</div>}

          <div className="account-menu__section">
            <span className="account-menu__label" id={`${menuId}-theme`}>
              Theme
            </span>
            <div className="account-menu__segmented" role="group" aria-labelledby={`${menuId}-theme`}>
              {THEMES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`account-menu__segment ${theme === value ? "account-menu__segment--active" : ""}`}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {subscription !== undefined && (
            <div className="account-menu__section account-menu__section--stacked">
              {onChoosePlan ? (
                <button
                  type="button"
                  className="account-menu__item"
                  onClick={() => {
                    setOpen(false);
                    onChoosePlan();
                  }}
                >
                  Choose a plan
                </button>
              ) : (
                <button
                  type="button"
                  className="account-menu__item"
                  onClick={handleManageBilling}
                  disabled={openingBilling || !subscription?.status}
                >
                  {openingBilling ? "Opening billing…" : "Manage billing"}
                </button>
              )}
              <span className="account-menu__hint">{subscriptionStatusLine(subscription, trialEnd)}</span>
              {billingError && (
                <span className="account-menu__error" role="alert">
                  {billingError}
                </span>
              )}
            </div>
          )}

          <div className="account-menu__section account-menu__section--stacked">
            {onStartTour && (
              <button
                type="button"
                className="account-menu__item"
                onClick={() => {
                  setOpen(false);
                  onStartTour();
                }}
              >
                Take the tour
              </button>
            )}
            <button type="button" className="account-menu__item" onClick={onSignOut}>
              Sign out
            </button>
            <button
              type="button"
              className="account-menu__item account-menu__item--danger"
              onClick={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? "Deleting account…" : "Delete account"}
            </button>
            {deleteError && (
              <span className="account-menu__error" role="alert">
                {deleteError}
              </span>
            )}
          </div>
          <div className="account-menu__legal">
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </div>

          {LOGOS_ENABLED && (
            <a className="account-menu__credit" href="https://logo.dev" target="_blank" rel="noreferrer">
              Logos provided by Logo.dev
            </a>
          )}
        </div>
      )}
    </div>
  );
}
