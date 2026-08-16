import { useEffect } from "react";
import type { LeetCodeStatus } from "../../hooks/useLeetCodeSync";
import { LeetCodeConnectCard } from "./LeetCodeConnectCard";

interface SettingsPanelProps {
  onClose: () => void;
  leetCodeStatus: LeetCodeStatus;
  leetCodeUsername: string | null;
  leetCodeStats: { solved: number; easy: number; medium: number; hard: number } | null;
  leetCodeLastSyncedAt: string | null;
  leetCodeError: string | null;
  onConnectLeetCode: (username: string) => void;
  onResyncLeetCode: () => void;
}

export function SettingsPanel({
  onClose,
  leetCodeStatus,
  leetCodeUsername,
  leetCodeStats,
  leetCodeLastSyncedAt,
  leetCodeError,
  onConnectLeetCode,
  onResyncLeetCode,
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
          <section>
            <div className="settings-panel__section-title">LeetCode</div>
            <LeetCodeConnectCard
              status={leetCodeStatus}
              username={leetCodeUsername}
              stats={leetCodeStats}
              lastSyncedAt={leetCodeLastSyncedAt}
              error={leetCodeError}
              onConnect={onConnectLeetCode}
              onResync={onResyncLeetCode}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
