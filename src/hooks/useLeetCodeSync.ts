import { useCallback, useEffect, useRef, useState } from "react";
import { getLeetCodeAccount, triggerLeetCodeSync, type LeetCodeAccount } from "../lib/leetcode";

export type LeetCodeStatus = "disconnected" | "connecting" | "connected" | "error";

const POLL_INTERVAL_MS = 1500;

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

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const latest = await getLeetCodeAccount();
    setAccount(latest);
    if (latest?.sync_status !== "syncing") stopPolling();
    return latest;
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimer.current = setInterval(refresh, POLL_INTERVAL_MS);
  }, [refresh, stopPolling]);

  useEffect(() => {
    if (!userId) return;
    refresh().finally(() => setLoading(false));
    return stopPolling;
  }, [userId, refresh, stopPolling]);

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
    error: account?.last_error ?? null,
    loading,
    connect,
    resync,
  };
}
