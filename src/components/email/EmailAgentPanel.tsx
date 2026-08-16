import { useEffect } from "react";
import type { AgentLogEntry, SyncResult } from "../../hooks/useEmailAgent";
import { RecentUpdates, FullAgentLog } from "./EmailAgentLog";
import { SyncSummary } from "./SyncSummary";

interface EmailAgentPanelProps {
  onClose: () => void;
  isAuthenticated: boolean;
  authenticate: () => void;
  disconnect: () => void;
  syncing: boolean;
  syncProgress: string;
  lastSyncResult: SyncResult | null;
  syncError: string | null;
  onSync: () => void;
  agentLog: AgentLogEntry[];
  onUndo: (entry: AgentLogEntry) => void;
  syncSummary: string | null;
}

export function EmailAgentPanel({
  onClose,
  isAuthenticated,
  authenticate,
  disconnect,
  syncing,
  syncProgress,
  lastSyncResult,
  syncError,
  onSync,
  agentLog,
  onUndo,
  syncSummary,
}: EmailAgentPanelProps) {
  const hasClientId = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="email-panel-backdrop" onClick={onClose}>
      <div
        className="email-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Gmail sync agent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="email-panel__header">
          <h2>Gmail sync agent</h2>
          <button type="button" className="email-panel__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="email-panel__body">
          <section className="email-panel__section">
            <div className="email-panel__section-title">
              <span>Connection</span>
              {isAuthenticated && (
                <span className="email-panel__connected">
                  <span className="email-panel__connected-dot" /> Connected
                </span>
              )}
            </div>

            {!hasClientId && (
              <p className="email-panel__warning">
                Add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env.local</code> to enable Gmail sync.
              </p>
            )}

            {!isAuthenticated ? (
              <div className="email-panel__connect">
                <p className="email-panel__hint">
                  Connect Gmail to scan recruiting emails and auto-update your pipeline. Read-only access — it can't send or delete anything.
                </p>
                <button
                  type="button"
                  className="email-panel__primary-button"
                  onClick={authenticate}
                  disabled={!hasClientId}
                >
                  Connect Gmail
                </button>
              </div>
            ) : (
              <div className="email-panel__connect email-panel__connect--row">
                <p className="email-panel__hint">Gmail is connected. You'll stay connected across sessions.</p>
                <button type="button" className="email-panel__disconnect" onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            )}
          </section>

          <section className="email-panel__section">
            <div className="email-panel__section-title">
              <span>Email sync</span>
            </div>

            {syncError && <p className="email-panel__error">{syncError}</p>}

            {syncing && syncProgress && <p className="email-panel__progress">{syncProgress}</p>}

            {!syncing && lastSyncResult && (
              <p className="email-panel__result">
                Processed {lastSyncResult.processed} emails · Updated {lastSyncResult.updated} companies · Skipped{" "}
                {lastSyncResult.skipped}
              </p>
            )}

            <div className="email-panel__sync-row">
              <button
                type="button"
                className="email-panel__primary-button"
                onClick={onSync}
                disabled={!isAuthenticated || syncing}
              >
                {syncing ? "Syncing…" : "Sync emails"}
              </button>
              <p className="email-panel__hint">Scans recent recruiting-related emails</p>
            </div>
          </section>

          <SyncSummary summary={syncSummary} />

          <RecentUpdates agentLog={agentLog} onUndo={onUndo} />
          <FullAgentLog agentLog={agentLog} />
        </div>
      </div>
    </div>
  );
}
