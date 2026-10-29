import { useEffect } from "react";
import { BillingCard } from "./BillingCard";
import type { Subscription } from "../../lib/billing";

interface SettingsPanelProps {
  onClose: () => void;
  // undefined when billing is disabled — hides the Billing section entirely.
  subscription?: Subscription | null;
}

export function SettingsPanel({
  onClose,
  subscription,
}: SettingsPanelProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="settings-panel-backdrop" onClick={onClose}>
      <div
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-panel__header">
          <h2>Settings</h2>
          <button type="button" className="settings-panel__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="settings-panel__body">
          {subscription !== undefined && (
            <section>
              <div className="settings-panel__section-title">Billing</div>
              <BillingCard subscription={subscription} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
