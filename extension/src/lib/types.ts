export type Platform = "leetcode" | "neetcode";
export type Mode = "ai" | "solutions" | "full";
export type Outcome = "solved" | "timeout" | "aborted" | "abandoned";
export type Struggle = "understanding" | "approach" | "efficiency" | "edge_cases" | "debugging";

export const MODE_LABELS: Record<Mode, string> = {
  ai: "Block AI sites",
  solutions: "Block solutions",
  full: "Full lockdown",
};

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  ai: "ChatGPT, Claude, Gemini, Copilot and other AI chat sites are blocked.",
  solutions: "AI sites, YouTube, and the problem's Solutions / Editorial / Discuss tabs are blocked.",
  full: "Everything except LeetCode, NeetCode and Vantage is blocked.",
};

export const STRUGGLE_LABELS: Record<Struggle, string> = {
  understanding: "Understanding the problem",
  approach: "Finding an approach",
  efficiency: "Making it efficient",
  edge_cases: "Edge cases",
  debugging: "Debugging my code",
};

/** What the content script knows about the problem on the page. */
export interface ProblemInfo {
  platform: Platform;
  /** Slug on the site the user is on. */
  slug: string;
  /** LeetCode slug (same as slug on LeetCode; looked up from the page on NeetCode). */
  leetcodeSlug: string | null;
  title: string;
  url: string;
}

export interface Session {
  id: string;
  problem: ProblemInfo;
  mode: Mode;
  minutes: number;
  startedAt: number;
  endsAt: number;
  hintsShown: number;
  struggles: Struggle[];
  /** Index into PASSAGES while an abort is in progress. */
  abortPassage: number | null;
  abortStartedAt: number | null;
  /** NeetCode only: the content script saw an "Accepted" result after a Submit. */
  acceptedSeen: boolean;
  /** Fullscreen focus mode: leaving the problem pops up the "BAD" window. */
  fullscreen: boolean;
  /** Siren mode (fullscreen only): a siren blares while the BAD window is up. */
  siren: boolean;
  /** The problem's tab and window (fullscreen focus mode watches these). */
  tabId: number | null;
  windowId: number | null;
  /** Times the user left the problem during a fullscreen session. */
  escapes: number;
  /** Currently away from the problem (one escape lasts until they come back). */
  away: boolean;
}

export interface Hint {
  kind: "hint" | "complexity";
  /** Sanitized-on-render HTML from LeetCode / NeetCode. */
  html: string;
}

export interface HintBundle {
  hints: Hint[];
  topics: string[];
  source: "leetcode" | "neetcode" | "none";
  tip: string;
}

export interface AuthState {
  email: string | null;
  hasAccess: boolean | null;
}

/** Messages to the background service worker. */
export type Request =
  | { type: "getAuth" }
  | { type: "signIn"; email: string; password: string }
  | { type: "signInGoogle" }
  | { type: "signOut" }
  | { type: "start"; problem: ProblemInfo; mode: Mode; minutes: number; fullscreen: boolean; siren: boolean; tabId: number | null }
  | { type: "getHints"; struggle: Struggle; pageHints: Hint[] }
  | { type: "hintShown" }
  | { type: "solved" }
  | { type: "neetcodeAccepted" }
  | { type: "openAbort" }
  | { type: "abortBegin" }
  | { type: "abortComplete"; typed: string }
  | { type: "focusProblem" }
  /** Content script: the page left fullscreen while the session was armed. */
  | { type: "escaped" }
  /** BAD window: take me back to the problem (refocus + fullscreen). */
  | { type: "backToProblem" };

/** Messages to the content script. */
export type ContentRequest = { type: "describe" };

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export const SESSION_KEY = "focusSession";

export async function send<T>(req: Request): Promise<Result<T>> {
  try {
    const res = (await chrome.runtime.sendMessage(req)) as Result<T> | undefined;
    return res ?? { ok: false, error: "No response from the extension." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function readSession(): Promise<Session | null> {
  const got = await chrome.storage.local.get(SESSION_KEY);
  return (got[SESSION_KEY] as Session | undefined) ?? null;
}

export function onSessionChange(cb: (s: Session | null) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && SESSION_KEY in changes) cb((changes[SESSION_KEY].newValue as Session | undefined) ?? null);
  });
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
