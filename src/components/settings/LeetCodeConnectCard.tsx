import { useState } from "react";
import type { LeetCodeStatus } from "../../hooks/useLeetCodeSync";

interface LeetCodeConnectCardProps {
  status: LeetCodeStatus;
  username: string | null;
  stats: { solved: number; easy: number; medium: number; hard: number } | null;
  lastSyncedAt: string | null;
  error: string | null;
  onConnect: (username: string) => void;
  onResync: () => void;
}

function formatSyncedAt(iso: string | null): string | null {
  if (!iso) return null;
  return `Last synced ${new Date(iso).toLocaleString()}`;
}

export function LeetCodeConnectCard({
  status,
  username,
  stats,
  lastSyncedAt,
  error,
  onConnect,
  onResync,
}: LeetCodeConnectCardProps) {
  const [input, setInput] = useState("");
  const isBusy = status === "connecting";

  if (status === "disconnected") {
    return (
      <div className="leetcode-card">
        <div className="leetcode-card__connect">
          <p className="leetcode-card__hint">
            Connect your LeetCode username to pull solved-problem stats. Syncs the last 20 accepted
            submissions each run — history builds up over repeated syncs, not all at once.
          </p>
          <div className="leetcode-card__input-row">
            <input
              type="text"
              className="leetcode-card__input"
              placeholder="LeetCode username"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onConnect(input)}
            />
            <button
              type="button"
              className="leetcode-card__primary-button"
              onClick={() => onConnect(input)}
              disabled={!input.trim()}
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="leetcode-card">
      <div className="leetcode-card__status-row">
        <div>
          <div className="leetcode-card__username">{username}</div>
          {status === "connected" && lastSyncedAt && (
            <p className="leetcode-card__synced-at">{formatSyncedAt(lastSyncedAt)}</p>
          )}
          {status === "connecting" && <p className="leetcode-card__synced-at">Syncing…</p>}
        </div>
        <button
          type="button"
          className="leetcode-card__secondary-button"
          onClick={onResync}
          disabled={isBusy}
        >
          {isBusy ? "Syncing…" : "Resync"}
        </button>
      </div>

      {status === "error" && error && <p className="leetcode-card__error">{error}</p>}

      {stats && (
        <div className="leetcode-card__stats">
          <div className="leetcode-card__stat">
            <span className="leetcode-card__stat-value">{stats.solved}</span>
            <span className="leetcode-card__stat-label">Solved</span>
          </div>
          <div className="leetcode-card__stat">
            <span className="leetcode-card__stat-value">{stats.easy}</span>
            <span className="leetcode-card__stat-label">Easy</span>
          </div>
          <div className="leetcode-card__stat">
            <span className="leetcode-card__stat-value">{stats.medium}</span>
            <span className="leetcode-card__stat-label">Medium</span>
          </div>
          <div className="leetcode-card__stat">
            <span className="leetcode-card__stat-value">{stats.hard}</span>
            <span className="leetcode-card__stat-label">Hard</span>
          </div>
        </div>
      )}
    </div>
  );
}
