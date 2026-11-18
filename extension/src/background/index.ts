import { supabase } from "../lib/supabase";
import { applyLockdown, clearLockdown, installReferer } from "../lib/lockdown";
import { buildHints, leetcodeGraphQL } from "../lib/hints";
import { MIN_ABORT_MS, PASSAGES, normalizeTyping } from "../lib/passages";
import { type AuthState, type Outcome, type Request, type Result, type Session } from "../lib/types";
import { getSession, serial, setSession, updateSession } from "./store";
import { backToProblem, exitFocus, installFocusWatchers, reportFullscreenExit, resumeFocus, trustTab } from "./focus";

const END_ALARM = "focus-end";
const APP_URL = "https://www.vantageprep.dev";

// Listeners must be registered synchronously at startup so events that wake
// the worker are delivered.
installFocusWatchers();

// ---------- auth ----------

async function authState(): Promise<AuthState> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email ?? null;
  if (!data.session) return { email: null, hasAccess: null };
  const { data: access, error } = await supabase.rpc("has_app_access");
  return { email, hasAccess: error ? null : Boolean(access) };
}

async function signInGoogle(): Promise<AuthState> {
  const redirectTo = chrome.identity.getRedirectURL();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error(error?.message ?? "Couldn't start Google sign-in.");
  const result = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  if (!result) throw new Error("Google sign-in was cancelled.");
  const back = new URL(result);
  const code = back.searchParams.get("code");
  if (!code) throw new Error(back.searchParams.get("error_description") ?? "Google sign-in didn't return a code.");
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw new Error(exchangeError.message);
  return authState();
}

// ---------- session lifecycle ----------

async function startSession(req: Extract<Request, { type: "start" }>): Promise<Session> {
  if (await getSession()) throw new Error("A focus session is already running.");
  const auth = await authState();
  if (!auth.email) throw new Error("Sign in to Vantage first.");
  if (auth.hasAccess === false) throw new Error("Your Vantage trial has ended. Choose a plan to keep using Focus.");

  const minutes = Math.round(req.minutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 180) throw new Error("Pick between 1 and 180 minutes.");

  let tabId: number | null = null;
  let windowId: number | null = null;
  if (req.tabId !== null) {
    try {
      const tab = await chrome.tabs.get(req.tabId);
      tabId = tab.id ?? null;
      windowId = tab.windowId;
    } catch {
      /* tab closed between popup and start */
    }
  }
  if (req.fullscreen) {
    if (!(await chrome.extension.isAllowedIncognitoAccess())) {
      throw new Error('Fullscreen focus needs "Allow in Incognito" turned on for Vantage Focus.');
    }
    if (tabId === null) throw new Error("Couldn't find the problem's tab.");
  }

  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(),
    problem: req.problem,
    mode: req.mode,
    minutes,
    startedAt: now,
    endsAt: now + minutes * 60_000,
    hintsShown: 0,
    struggles: [],
    abortPassage: null,
    abortStartedAt: null,
    acceptedSeen: false,
    fullscreen: req.fullscreen,
    siren: req.fullscreen && req.siren,
    tabId,
    windowId,
    escapes: 0,
    away: false,
  };

  await serial(() => setSession(session));
  await applyLockdown(session.mode);
  await chrome.alarms.create(END_ALARM, { when: session.endsAt });
  if (session.fullscreen && windowId !== null) {
    await chrome.windows.update(windowId, { state: "fullscreen", focused: true });
  }

  const { error } = await supabase.from("focus_sessions").insert({
    id: session.id,
    platform: session.problem.platform,
    problem_slug: session.problem.slug,
    problem_title: session.problem.title,
    mode: session.mode,
    planned_minutes: session.minutes,
    started_at: new Date(session.startedAt).toISOString(),
    fullscreen: session.fullscreen,
  });
  if (error) console.warn("Vantage Focus: couldn't log session start", error.message);
  return session;
}

async function endSession(outcome: Outcome): Promise<void> {
  const s = await serial(async () => {
    const current = await getSession();
    await setSession(null);
    return current;
  });
  await chrome.alarms.clear(END_ALARM);
  await clearLockdown();
  if (!s) return;
  await exitFocus(s);
  await chrome.storage.local.remove(`vf-revealed:${s.id}`);

  const { error } = await supabase
    .from("focus_sessions")
    .update({
      ended_at: new Date().toISOString(),
      outcome,
      hints_shown: s.hintsShown,
      struggles: Array.from(new Set(s.struggles)),
      escapes: s.escapes,
    })
    .eq("id", s.id);
  if (error) console.warn("Vantage Focus: couldn't log session end", error.message);

  const messages: Record<Outcome, string> = {
    solved: `Solved ${s.problem.title}. Browser unlocked.`,
    timeout: `Time's up on ${s.problem.title}. Browser unlocked.`,
    aborted: "Session ended early. Browser unlocked.",
    abandoned: "Session ended. Browser unlocked.",
  };
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: outcome === "solved" ? "Nice work" : "Vantage Focus",
    message: messages[outcome],
  });
}

async function leetcodeUsername(): Promise<string | null> {
  const { data } = await supabase.from("leetcode_account").select("username").maybeSingle();
  if (data?.username) return data.username as string;
  try {
    const status = await leetcodeGraphQL<{ userStatus: { username: string; isSignedIn: boolean } }>(
      "query { userStatus { username isSignedIn } }",
      {},
    );
    return status.userStatus.isSignedIn ? status.userStatus.username : null;
  } catch {
    return null;
  }
}

async function verifySolved(s: Session): Promise<boolean> {
  if (s.problem.platform === "neetcode" && s.acceptedSeen) return true;
  const slug = s.problem.leetcodeSlug;
  if (!slug) return false;
  const username = await leetcodeUsername();
  if (!username) {
    throw new Error("Couldn't find your LeetCode username. Connect it in Vantage or sign in to LeetCode.");
  }
  const data = await leetcodeGraphQL<{ recentAcSubmissionList: { titleSlug: string; timestamp: string }[] }>(
    `query focusRecentAc($username: String!) {
      recentAcSubmissionList(username: $username, limit: 20) { titleSlug timestamp }
    }`,
    { username },
  );
  // A minute of slack for clock skew between this machine and LeetCode.
  const since = s.startedAt / 1000 - 60;
  return data.recentAcSubmissionList.some((sub) => sub.titleSlug === slug && Number(sub.timestamp) >= since);
}

// ---------- messages ----------

async function handle(req: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (req.type) {
    case "getAuth":
      return authState();

    case "signIn": {
      const { error } = await supabase.auth.signInWithPassword({ email: req.email.trim(), password: req.password });
      if (error) throw new Error(error.message);
      return authState();
    }

    case "signInGoogle":
      return signInGoogle();

    case "signOut":
      if (await getSession()) throw new Error("Finish or abort the running session before signing out.");
      await supabase.auth.signOut();
      return authState();

    case "start":
      return startSession(req);

    case "getHints": {
      const s = await updateSession((cur) => ({ struggles: [...cur.struggles, req.struggle] }));
      if (!s) throw new Error("No focus session is running.");
      return buildHints(s.problem.leetcodeSlug, req.struggle, req.pageHints);
    }

    case "hintShown":
      return updateSession((cur) => ({ hintsShown: cur.hintsShown + 1 }));

    case "neetcodeAccepted":
      return updateSession(() => ({ acceptedSeen: true }));

    case "solved": {
      const s = await getSession();
      if (!s) throw new Error("No focus session is running.");
      if (!(await verifySolved(s))) return false;
      await endSession("solved");
      return true;
    }

    case "openAbort": {
      // In fullscreen focus mode, open it next to the problem so it isn't an escape.
      const s = await getSession();
      const tab = await chrome.tabs.create({
        url: chrome.runtime.getURL("pages/abort.html"),
        windowId: s?.fullscreen && s.windowId !== null ? s.windowId : undefined,
      });
      if (tab.id !== undefined) await trustTab(tab.id);
      return true;
    }

    case "escaped": {
      const s = await getSession();
      // Only the problem tab dropping out of fullscreen counts.
      if (s?.fullscreen && sender.tab?.id === s.tabId) await reportFullscreenExit();
      return true;
    }

    case "backToProblem":
      await backToProblem();
      return true;

    case "abortBegin": {
      const s = await updateSession((cur) => {
        // Reloading the abort page keeps the same passage and start time.
        if (cur.abortPassage !== null) return {};
        return { abortPassage: Math.floor(Math.random() * PASSAGES.length), abortStartedAt: Date.now() };
      });
      if (!s || s.abortPassage === null) throw new Error("No focus session is running.");
      return PASSAGES[s.abortPassage];
    }

    case "abortComplete": {
      const s = await getSession();
      if (!s || s.abortPassage === null || s.abortStartedAt === null) throw new Error("No abort in progress.");
      if (normalizeTyping(req.typed) !== normalizeTyping(PASSAGES[s.abortPassage].text)) {
        throw new Error("The passage doesn't match yet.");
      }
      if (Date.now() - s.abortStartedAt < MIN_ABORT_MS) throw new Error("That was suspiciously fast.");
      await endSession("aborted");
      return true;
    }

    case "focusProblem": {
      const s = await getSession();
      const url = s?.problem.url ?? APP_URL;
      if (sender.tab?.id !== undefined) await chrome.tabs.update(sender.tab.id, { url });
      else await chrome.tabs.create({ url });
      return true;
    }
  }
}

chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
  // Only our own pages and content scripts talk to us.
  if (sender.id !== chrome.runtime.id) return false;
  handle(req, sender).then(
    (data) => sendResponse({ ok: true, data } satisfies Result),
    (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies Result),
  );
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === END_ALARM) void endSession("timeout");
});

// Granting <all_urls> later swaps hard blocks for the friendly blocked page.
chrome.permissions.onAdded.addListener(async () => {
  const s = await getSession();
  if (s) await applyLockdown(s.mode);
});

// ---------- boot: runs every time the worker wakes ----------

async function reconcile(): Promise<void> {
  await installReferer();
  const s = await getSession();
  if (!s) {
    await clearLockdown();
    return;
  }
  if (Date.now() >= s.endsAt) {
    await endSession("timeout");
    return;
  }
  if (!(await chrome.alarms.get(END_ALARM))) await chrome.alarms.create(END_ALARM, { when: s.endsAt });
  await applyLockdown(s.mode);
  await resumeFocus();
}

void reconcile();
