import { useId, useState, type FormEvent } from "react";
import type { useLeetCodeSync } from "../../hooks/useLeetCodeSync";

export type LeetCodeSyncState = ReturnType<typeof useLeetCodeSync>;

// Sits next to the Company Questions heading. Before an account is linked it's
// a username field + Sync button; afterwards it shows the account and a
// Resync button. Each sync only sees LeetCode's 20 most recent accepted
// submissions, so solved history builds up over repeated syncs.
export function LeetCodeSync({ leetCode }: { leetCode: LeetCodeSyncState }) {
  const { status, username, stats, error, loading, connect, resync } = leetCode;
  const [editing, setEditing] = useState(false);
  const breakdownId = useId();
  const [input, setInput] = useState("");

  if (loading) return null;

  const showForm = status === "disconnected" || editing;

  if (showForm) {
    const handleSubmit = (event: FormEvent) => {
      event.preventDefault();
      if (!input.trim()) return;
      setEditing(false);
      connect(input);
    };
    return (
      <form className="leetcode-sync" onSubmit={handleSubmit}>
        <input
          className="leetcode-sync__input"
          type="text"
          placeholder="Enter your LeetCode username"
          aria-label="LeetCode username"
          autoComplete="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus={editing}
        />
        <button type="submit" className="leetcode-sync__button leetcode-sync__button--primary" disabled={!input.trim()}>
          Sync
        </button>
        {editing && (
          <button type="button" className="leetcode-sync__button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </form>
    );
  }

  const syncing = status === "connecting";
  const showBreakdown = status === "connected" && !!stats;

  return (
    <div className="leetcode-sync">
      <div
        className="leetcode-sync__account"
        // Focusable when there's a breakdown so keyboard users can reveal it too.
        tabIndex={showBreakdown ? 0 : undefined}
        aria-describedby={showBreakdown ? breakdownId : undefined}
      >
        <span
          className={`leetcode-sync__dot ${status === "error" ? "leetcode-sync__dot--error" : ""} ${
            syncing ? "leetcode-sync__dot--syncing" : ""
          }`}
          aria-hidden="true"
        />
        <span className="leetcode-sync__username">{username}</span>
        {syncing ? (
          <span className="leetcode-sync__meta">Syncing…</span>
        ) : status === "error" ? (
          <span className="leetcode-sync__meta leetcode-sync__meta--error" role="alert">
            {error ?? "Sync failed"}
          </span>
        ) : (
          stats && <span className="leetcode-sync__meta">{stats.solved.toLocaleString()} solved</span>
        )}
        {showBreakdown && (
          <div id={breakdownId} role="tooltip" className="leetcode-sync__breakdown">
            <span className="leetcode-sync__breakdown-item leetcode-sync__breakdown-item--easy">
              {stats.easy.toLocaleString()} <small>Easy</small>
            </span>
            <span className="leetcode-sync__breakdown-item leetcode-sync__breakdown-item--medium">
              {stats.medium.toLocaleString()} <small>Med</small>
            </span>
            <span className="leetcode-sync__breakdown-item leetcode-sync__breakdown-item--hard">
              {stats.hard.toLocaleString()} <small>Hard</small>
            </span>
          </div>
        )}
      </div>
      <button type="button" className="leetcode-sync__button" onClick={resync} disabled={syncing}>
        {syncing ? "Syncing…" : "Resync"}
      </button>
      {status === "error" && (
        <button
          type="button"
          className="leetcode-sync__button"
          onClick={() => {
            setInput(username ?? "");
            setEditing(true);
          }}
        >
          Change username
        </button>
      )}
    </div>
  );
}
