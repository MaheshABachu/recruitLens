import { useEffect, useState } from "react";

// Stale-while-revalidate cache for shared reference data (job/internship
// postings, company question banks). Results live in memory for the session
// and in IndexedDB across visits, so a revisit renders the last-seen data
// immediately while a fresh copy loads in the background.
//
// Only for global, non-user data: entries aren't scoped to the signed-in user.
// Bump CACHE_VERSION when a cached value's shape changes.

const CACHE_VERSION = 2;
const DB_NAME = "vantage-cache";
const STORE = "entries";

interface Entry<T> {
  value: T;
  fetchedAt: number;
}

const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(entry: Entry<unknown>) => void>>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

// IndexedDB can be missing or throw (private windows, blocked storage); every
// caller treats null as "no persistent cache" and carries on.
function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

const storageKey = (key: string) => `v${CACHE_VERSION}:${key}`;

async function readPersisted<T>(key: string): Promise<Entry<T> | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(storageKey(key));
      request.onsuccess = () => resolve(request.result as Entry<T> | undefined);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function writePersisted<T>(key: string, entry: Entry<T>) {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).put(entry, storageKey(key));
  } catch {
    // Quota or a closed connection — the memory copy still works.
  }
}

function publish<T>(key: string, entry: Entry<T>) {
  memory.set(key, entry);
  listeners.get(key)?.forEach((listener) => listener(entry as Entry<unknown>));
}

// Loads fresh data, deduping concurrent calls for the same key. Failed loads
// leave the cached value alone. Loaders should throw on failure rather than
// return an empty result, or the empty result gets cached.
export function refresh<T>(key: string, loader: () => Promise<T>): Promise<T> {
  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = loader()
      .then((value) => {
        const entry = { value, fetchedAt: Date.now() };
        publish(key, entry);
        void writePersisted(key, entry);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

// Synchronous memory read, for rendering a revisited view with no flash.
export function peek<T>(key: string): T | undefined {
  return (memory.get(key) as Entry<T> | undefined)?.value;
}

// Warm the cache ahead of need (e.g. the Jobs tab while the user is on
// another tab). No-op when a fresh enough copy is already in memory.
export function prefetch<T>(key: string, loader: () => Promise<T>, maxAgeMs: number) {
  const entry = memory.get(key);
  if (entry && Date.now() - entry.fetchedAt < maxAgeMs) return;
  void ensure(key, loader, maxAgeMs).catch(() => {});
}

// Memory → IndexedDB → network. Resolves with whatever is available first and
// revalidates in the background when it's older than maxAgeMs.
async function ensure<T>(key: string, loader: () => Promise<T>, maxAgeMs: number): Promise<T> {
  let entry = memory.get(key) as Entry<T> | undefined;
  if (!entry) {
    const persisted = await readPersisted<T>(key);
    // Something may have loaded while IndexedDB answered; keep the newer one.
    entry = (memory.get(key) as Entry<T> | undefined) ?? persisted;
    if (persisted && !memory.has(key)) publish(key, persisted);
  }
  if (!entry) return refresh(key, loader);
  if (Date.now() - entry.fetchedAt >= maxAgeMs) {
    refresh(key, loader).catch((err) => console.error(`Refreshing ${key} failed:`, err));
  }
  return entry.value;
}

// React binding. `key` null disables it. `loading` is true only when there's
// nothing to show yet — background revalidation updates `data` in place.
export function useSwr<T>(key: string | null, loader: () => Promise<T>, maxAgeMs: number) {
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: unknown }>(() => ({
    key,
    data: key ? peek<T>(key) : undefined,
    error: null,
  }));

  // Reset synchronously when the key changes so a stale key's data never
  // renders under the new one.
  let current = state;
  if (state.key !== key) {
    current = { key, data: key ? peek<T>(key) : undefined, error: null };
    setState(current);
  }

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const listener = (entry: Entry<unknown>) => {
      if (!cancelled) setState({ key, data: entry.value as T, error: null });
    };
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(listener);

    ensure(key, loader, maxAgeMs)
      .then((value) => {
        if (!cancelled) setState((prev) => (prev.key === key && prev.data === value ? prev : { key, data: value, error: null }));
      })
      .catch((error) => {
        console.error(`Loading ${key} failed:`, error);
        if (!cancelled) setState((prev) => (prev.key === key ? { ...prev, error } : prev));
      });

    return () => {
      cancelled = true;
      set.delete(listener);
    };
    // loader is expected to be stable per key; re-running on identity would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, maxAgeMs]);

  return {
    data: current.data,
    loading: key !== null && current.data === undefined && !current.error,
    error: current.error,
  };
}
