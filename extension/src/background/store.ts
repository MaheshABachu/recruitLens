import { SESSION_KEY, type Session } from "../lib/types";

// Every read-modify-write of the session goes through one queue so
// concurrent messages and browser events don't clobber each other.
let queue: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export async function getSession(): Promise<Session | null> {
  return ((await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY] as Session | undefined) ?? null;
}

export async function setSession(s: Session | null): Promise<void> {
  if (s) await chrome.storage.local.set({ [SESSION_KEY]: s });
  else await chrome.storage.local.remove(SESSION_KEY);
}

export function updateSession(patch: (s: Session) => Partial<Session>): Promise<Session | null> {
  return serial(async () => {
    const s = await getSession();
    if (!s) return null;
    const next = { ...s, ...patch(s) };
    await setSession(next);
    return next;
  });
}
