import { useCallback, useEffect, useRef, useState } from "react";
import { checkLeetCodeForChanges, getLeetCodeAccount, triggerLeetCodeSync, type LeetCodeAccount } from "../lib/leetcode";

export type LeetCodeStatus = "disconnected" | "connecting" | "connected" | "error";

const POLL_INTERVAL_MS = 1500;
// Minimum gap between automatic change probes (app load / tab refocus).
const CHECK_THROTTLE_MS = 5 * 60 * 1000;

function deriveStatus(account: LeetCodeAccount | null): LeetCodeStatus {
  if (!account || !account.username) return "disconnected";
  if (account.sync_status === "syncing") return "connecting";
  if (account.sync_status === "error") return "error";
  return "connected";
}

export function useLeetCodeSync(userId: string | null) {
  const [account, setAccount] = useState<LeetCodeAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Focus/visibility listeners outlive any one render — read the latest row
  // through a ref instead of a stale closure.
  const accountRef = useRef<LeetCodeAccount | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const latest = await getLeetCodeAccount();
    accountRef.current = latest;
    setAccount(latest);
    if (latest?.sync_status !== "syncing") stopPolling();
    return latest;
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimer.current = setInterval(refresh, POLL_INTERVAL_MS);
  }, [refresh, stopPolling]);

  // Silent background probe — only pulls a full sync when LeetCode reports a
  // newer accepted submission. Errors stay in the console; manual Resync is
  // where sync failures get surfaced.
  const check = useCallback(async () => {
    const current = accountRef.current;
    if (checking.current || !current?.username || current.sync_status === "syncing") return;
    if (current.last_checked_at && Date.now() - new Date(current.last_checked_at).getTime() < CHECK_THROTTLE_MS) return;
    checking.current = true;
    try {
      const { account: updated } = await checkLeetCodeForChanges();
      if (updated) {
        accountRef.current = updated;
        setAccount(updated);
      }
    } catch (err) {
      console.error("LeetCode change check failed:", err);
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    refresh()
      .finally(() => setLoading(false))
      .then(check);

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [userId, refresh, stopPolling, check]);

  async function connect(username: string) {
    const trimmed = username.trim();
    if (!trimmed) return;
    // Optimistic — the row itself flips to "syncing" the moment the Edge
    // Function starts, but polling won't catch that for up to POLL_INTERVAL_MS.
    setAccount((prev) => ({
      username: trimmed,
      sync_status: "syncing",
      last_synced_at: prev?.last_synced_at ?? null,
      last_error: null,
      solved_count: prev?.solved_count ?? null,
      easy_count: prev?.easy_count ?? null,
      medium_count: prev?.medium_count ?? null,
      hard_count: prev?.hard_count ?? null,
      latest_submission_id: prev?.latest_submission_id ?? null,
      last_checked_at: prev?.last_checked_at ?? null,
      last_changed_at: prev?.last_changed_at ?? null,
    }));
    startPolling();
    try {
      await triggerLeetCodeSync(trimmed);
    } finally {
      refresh();
    }
  }

  async function resync() {
    if (!account?.username) return;
    setAccount((prev) => (prev ? { ...prev, sync_status: "syncing", last_error: null } : prev));
    startPolling();
    try {
      await triggerLeetCodeSync();
    } finally {
      refresh();
    }
  }

  return {
    status: deriveStatus(account),
    username: account?.username ?? null,
    // solved_count is only null before the first sync has ever completed —
    // show nothing rather than a misleading "0 Solved" while that's in flight.
    stats:
      account?.solved_count != null
        ? { solved: account.solved_count, easy: account.easy_count ?? 0, medium: account.medium_count ?? 0, hard: account.hard_count ?? 0 }
        : null,
    lastSyncedAt: account?.last_synced_at ?? null,
    // Bumps only when a sync saw new submissions — dependents (solved slugs)
    // refetch on this rather than on every probe.
    lastChangedAt: account?.last_changed_at ?? null,
    error: account?.last_error ?? null,
    loading,
    connect,
    resync,
  };
}
