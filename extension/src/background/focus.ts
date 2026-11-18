// Fullscreen focus mode. Chrome can't stop anyone leaving (Esc, Alt+Tab and
// the Windows key always work), so this watches for it instead: switching to
// another tab or window, leaving Chrome, or dropping out of fullscreen counts
// as an escape and pops up the flashing "BAD" window.
import { getSession, updateSession } from "./store";
import type { Session } from "../lib/types";

const BAD_KEY = "badWindowId";
const BAD_W = 360;
const BAD_H = 380;
// OS notifications, our own popup and window shuffling all cause brief focus
// blips; only count it if the user is still away after this long.
const GRACE_MS = 1500;

const OWN_TABS_KEY = "ownTabIds";

let pending: ReturnType<typeof setTimeout> | undefined;

// Tabs this extension opened itself (the Give up passage) aren't escapes.
// Kept in session storage so a worker restart doesn't forget them.
async function ownTabs(): Promise<number[]> {
  return ((await chrome.storage.session.get(OWN_TABS_KEY))[OWN_TABS_KEY] as number[] | undefined) ?? [];
}

export async function trustTab(tabId: number): Promise<void> {
  const ids = await ownTabs();
  if (!ids.includes(tabId)) await chrome.storage.session.set({ [OWN_TABS_KEY]: [...ids, tabId] });
}

async function isOwnTab(tabId: number | undefined): Promise<boolean> {
  return tabId !== undefined && (await ownTabs()).includes(tabId);
}

async function badWindowId(): Promise<number | null> {
  return ((await chrome.storage.session.get(BAD_KEY))[BAD_KEY] as number | undefined) ?? null;
}

async function setBadWindowId(id: number | null): Promise<void> {
  if (id === null) await chrome.storage.session.remove(BAD_KEY);
  else await chrome.storage.session.set({ [BAD_KEY]: id });
}

async function windowExists(id: number): Promise<boolean> {
  try {
    await chrome.windows.get(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Put the BAD window back in front, un-minimized, at its own size. Chrome
 * extensions can't make a window "always on top" of other apps, so instead
 * it's re-raised whenever something covers it and every few seconds while the
 * user is away. When another app has focus the OS may refuse to hand it over
 * and only flash Chrome's taskbar icon (drawAttention).
 */
async function raiseBad(id: number): Promise<void> {
  try {
    const w = await chrome.windows.get(id);
    // Small tolerance: Chrome/DPI scaling can round the size, and an exact
    // check would fight it forever.
    const resized = Math.abs((w.width ?? BAD_W) - BAD_W) > 8 || Math.abs((w.height ?? BAD_H) - BAD_H) > 8;
    if (w.state !== "normal" || resized) {
      await chrome.windows.update(id, { state: "normal" });
      await chrome.windows.update(id, { width: BAD_W, height: BAD_H });
    }
    if (!w.focused) await chrome.windows.update(id, { focused: true, drawAttention: true });
  } catch {
    /* closed in the meantime; onRemoved reopens it */
  }
}

const NAG_MS = 3000;
let nag: ReturnType<typeof setInterval> | undefined;

/** While the user is away, keep pulling the BAD window to the front. */
function startNag(): void {
  if (nag !== undefined) return;
  nag = setInterval(async () => {
    const s = await activeSession();
    const id = await badWindowId();
    if (!s?.away) return stopNag();
    if (id === null || !(await windowExists(id))) await showBad(s);
    else await raiseBad(id);
  }, NAG_MS);
}

function stopNag(): void {
  if (nag !== undefined) clearInterval(nag);
  nag = undefined;
}

/** Worker woke up mid-escape (it sleeps when idle): resume nagging. */
export async function resumeFocus(): Promise<void> {
  const s = await activeSession();
  if (s?.away) {
    await showBad(s);
    startNag();
  }
}

const SIREN_URL = "pages/siren.html";

/**
 * Blare the siren while the user is away. It plays from an offscreen document
 * (the worker has no audio), which starts sounding on load, so starting is
 * "make sure the document exists" and stopping is closing it.
 */
async function startSiren(): Promise<void> {
  try {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: SIREN_URL,
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Siren while the user has left a fullscreen focus session.",
    });
  } catch {
    /* already being created by a concurrent call */
  }
}

async function stopSiren(): Promise<void> {
  try {
    if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
  } catch {
    /* already closed */
  }
}

async function showBad(s: Session): Promise<void> {
  startNag();
  if (s.siren) void startSiren();
  const existing = await badWindowId();
  if (existing !== null && (await windowExists(existing))) {
    await raiseBad(existing);
    return;
  }
  // Centre it on the problem's window (falls back to wherever Chrome puts it).
  let left: number | undefined;
  let top: number | undefined;
  if (s.windowId !== null) {
    try {
      const w = await chrome.windows.get(s.windowId);
      if (w.left !== undefined && w.width !== undefined) left = Math.round(w.left + (w.width - BAD_W) / 2);
      if (w.top !== undefined && w.height !== undefined) top = Math.round(w.top + (w.height - BAD_H) / 2);
    } catch {
      /* problem window is gone */
    }
  }
  const win = await chrome.windows.create({
    type: "popup",
    url: chrome.runtime.getURL("pages/bad.html"),
    width: BAD_W,
    height: BAD_H,
    left,
    top,
    focused: true,
  });
  if (win?.id !== undefined) {
    await setBadWindowId(win.id);
    // Off-screen or not, ask the OS to flash the taskbar too.
    await chrome.windows.update(win.id, { drawAttention: true });
  }
}

export async function closeBad(): Promise<void> {
  stopNag();
  await stopSiren();
  const id = await badWindowId();
  // Forget the id first so onRemoved knows this close was ours, not the user's.
  await setBadWindowId(null);
  if (id !== null && (await windowExists(id))) await chrome.windows.remove(id);
}

/** Count an escape (once per departure) and show the BAD window. */
export async function registerEscape(): Promise<void> {
  clearPending();
  const s = await updateSession((cur) => (cur.away ? {} : { away: true, escapes: cur.escapes + 1 }));
  if (s?.fullscreen) await showBad(s);
}

function clearPending(): void {
  if (pending !== undefined) clearTimeout(pending);
  pending = undefined;
}

/**
 * Where is the user right now? Checked after the grace period rather than
 * trusting the event that started it, since focus events arrive in bursts.
 */
async function isAway(s: Session): Promise<boolean> {
  const w = await chrome.windows.getLastFocused();
  if (!w.focused) return true; // another app has focus
  if (w.id === (await badWindowId())) return false; // already showing BAD
  const [active] = await chrome.tabs.query({ active: true, windowId: w.id });
  if (await isOwnTab(active?.id)) return false;
  if (!(await onProblem(s, w.id!))) return true;
  return w.state !== "fullscreen";
}

function scheduleEscape(): void {
  if (pending !== undefined) return;
  pending = setTimeout(async () => {
    pending = undefined;
    const s = await activeSession();
    if (s && (await isAway(s))) await registerEscape();
  }, GRACE_MS);
}

/**
 * The problem page dropped out of fullscreen (held Esc, or the tab was
 * hidden). Counts unless it was us opening the Give up passage.
 */
export async function reportFullscreenExit(): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
  const w = await chrome.windows.getLastFocused();
  const [active] = await chrome.tabs.query({ active: true, windowId: w.id });
  if (await isOwnTab(active?.id)) return;
  await registerEscape();
}

async function markReturned(): Promise<void> {
  clearPending();
  const s = await updateSession((cur) => (cur.away ? { away: false } : {}));
  await closeBad();
  if (s?.fullscreen && s.windowId !== null) {
    try {
      const w = await chrome.windows.get(s.windowId);
      if (w.state !== "fullscreen") await chrome.windows.update(s.windowId, { state: "fullscreen" });
    } catch {
      /* window gone */
    }
  }
}

/** Is the problem tab the active tab of the focused window right now? */
async function onProblem(s: Session, focusedWindowId: number): Promise<boolean> {
  if (s.tabId === null || focusedWindowId !== s.windowId) return false;
  const [active] = await chrome.tabs.query({ active: true, windowId: focusedWindowId });
  return active?.id === s.tabId;
}

async function activeSession(): Promise<Session | null> {
  const s = await getSession();
  return s?.fullscreen ? s : null;
}

export async function backToProblem(): Promise<void> {
  const s = await activeSession();
  if (!s) return closeBad();
  let tabId = s.tabId;
  let windowId = s.windowId;
  // The problem tab may have been closed; reopen it.
  try {
    if (tabId === null) throw new Error("no tab");
    const tab = await chrome.tabs.get(tabId);
    windowId = tab.windowId;
  } catch {
    const win = await chrome.windows.create({ url: s.problem.url, focused: true, state: "fullscreen" });
    tabId = win?.tabs?.[0]?.id ?? null;
    windowId = win?.id ?? null;
    await updateSession(() => ({ tabId, windowId }));
  }
  if (tabId !== null) await chrome.tabs.update(tabId, { active: true });
  if (windowId !== null) await chrome.windows.update(windowId, { focused: true, state: "fullscreen" });
  await markReturned();
}

/** Put the window back to normal when a fullscreen session ends. */
export async function exitFocus(s: Session): Promise<void> {
  clearPending();
  await closeBad();
  if (!s.fullscreen || s.windowId === null) return;
  try {
    const w = await chrome.windows.get(s.windowId);
    if (w.state === "fullscreen") await chrome.windows.update(s.windowId, { state: "maximized" });
  } catch {
    /* window gone */
  }
}

export function installFocusWatchers(): void {
  chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    const s = await activeSession();
    if (!s) return;
    if (windowId === (await badWindowId())) return;
    if (tabId === s.tabId) return void markReturned();
    if (await isOwnTab(tabId)) return;
    scheduleEscape();
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    const s = await activeSession();
    if (!s) return;
    if (windowId === chrome.windows.WINDOW_ID_NONE) return scheduleEscape();
    const bad = await badWindowId();
    if (windowId === bad) return;
    if (await onProblem(s, windowId)) return void markReturned();
    const [active] = await chrome.tabs.query({ active: true, windowId });
    if (await isOwnTab(active?.id)) return;
    // Already away and clicked some other Chrome window: BAD back on top now.
    if (s.away && bad !== null) return void raiseBad(bad);
    scheduleEscape();
  });

  chrome.windows.onBoundsChanged.addListener(async (win) => {
    const s = await activeSession();
    if (!s || win.id === undefined) return;
    // Someone resized/moved-to-minimize the BAD window: snap it back.
    if (win.id === (await badWindowId())) return void raiseBad(win.id);
    // F11 / the problem window's own fullscreen being turned off.
    if (win.id !== s.windowId) return;
    const now = await chrome.windows.get(win.id);
    if (now.state !== "fullscreen" && now.state !== "minimized") scheduleEscape();
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const own = await ownTabs();
    if (own.includes(tabId)) await chrome.storage.session.set({ [OWN_TABS_KEY]: own.filter((id) => id !== tabId) });
    const s = await activeSession();
    if (s && tabId === s.tabId) await registerEscape();
  });

  // The user closed BAD while still away: it comes straight back. The only
  // way to make it go away is to return to the problem.
  chrome.windows.onRemoved.addListener(async (windowId) => {
    if (windowId !== (await badWindowId())) return;
    await setBadWindowId(null);
    const s = await activeSession();
    if (s?.away) await showBad(s);
  });
}
