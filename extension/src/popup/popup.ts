import "../lib/page.css";
import "./popup.css";
import { h } from "../lib/dom";
import {
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  formatRemaining,
  onSessionChange,
  readSession,
  send,
  type AuthState,
  type ContentRequest,
  type Mode,
  type ProblemInfo,
  type Session,
} from "../lib/types";

const APP_URL = "https://www.vantageprep.dev";
const PREFS_KEY = "focusPrefs";
const app = document.getElementById("app")!;

let auth: AuthState | null = null;
let session: Session | null = null;
let problem: ProblemInfo | null = null;
let error: string | null = null;
let busy = false;
let friendly = false;
let prefs: { minutes: number; mode: Mode; fullscreen: boolean; siren: boolean } = {
  minutes: 25,
  mode: "solutions",
  fullscreen: false,
  siren: false,
};
let problemTabId: number | null = null;
let incognitoAllowed = false;
let tick: number | undefined;
const typed = { email: "", password: "" };

async function currentProblem(): Promise<ProblemInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  problemTabId = tab.id;
  try {
    return ((await chrome.tabs.sendMessage(tab.id, { type: "describe" } satisfies ContentRequest)) as ProblemInfo | null) ?? null;
  } catch {
    return null; // not a LeetCode/NeetCode tab (no content script)
  }
}

function header(): HTMLElement {
  return h("div", { class: "head" }, h("span", { class: "brand" }, "Vantage Focus"));
}

function errorLine(): HTMLElement | null {
  return error ? h("p", { class: "error" }, error) : null;
}

async function run(fn: () => Promise<void>): Promise<void> {
  busy = true;
  error = null;
  render();
  try {
    await fn();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  busy = false;
  render();
}

function signedOut(): HTMLElement[] {
  // Re-renders rebuild the form, so keep what was typed.
  const email = h("input", {
    class: "input", type: "email", placeholder: "Email", autocomplete: "email", required: true, value: typed.email,
    onInput: (e) => { typed.email = (e.target as HTMLInputElement).value; },
  });
  const password = h("input", {
    class: "input", type: "password", placeholder: "Password", autocomplete: "current-password", required: true, value: typed.password,
    onInput: (e) => { typed.password = (e.target as HTMLInputElement).value; },
  });
  const form = h(
    "form",
    {
      class: "stack",
      onSubmit: (e) => {
        e.preventDefault();
        void run(async () => {
          const res = await send<AuthState>({ type: "signIn", email: email.value, password: password.value });
          if (!res.ok) throw new Error(res.error);
          auth = res.data;
        });
      },
    },
    email,
    password,
    h("button", { class: "btn btn--primary", type: "submit", disabled: busy }, "Sign in"),
  );
  return [
    h("p", { class: "dim" }, "Sign in with your Vantage account to start timed, locked-down practice sessions."),
    h("button", {
      class: "btn",
      disabled: busy,
      onClick: () =>
        void run(async () => {
          // The Google window takes focus and Chrome closes this popup; the
          // background finishes sign-in, and reopening the popup picks it up.
          const res = await send<AuthState>({ type: "signInGoogle" });
          if (!res.ok) throw new Error(res.error);
          auth = res.data;
        }),
    }, "Continue with Google"),
    form,
    errorLine(),
    h("p", { class: "small dim" }, "No account? ", h("a", { href: APP_URL, target: "_blank" }, "Sign up on Vantage"), "."),
  ].filter(Boolean) as HTMLElement[];
}

function noAccess(): HTMLElement[] {
  return [
    h("p", {}, "Your free trial has ended."),
    h("p", { class: "dim" }, "Choose a plan on Vantage to keep using Focus sessions."),
    h("a", { class: "btn btn--primary", href: APP_URL, target: "_blank", style: "text-align:center;text-decoration:none" }, "Choose a plan"),
  ];
}

function active(s: Session): HTMLElement[] {
  return ([
    h("div", { class: "problem" }, h("b", {}, s.problem.title), h("span", { class: "small dim" }, `${MODE_LABELS[s.mode]} · ${s.minutes} min`)),
    h("div", { class: "timer", id: "timer" }, formatRemaining(s.endsAt - Date.now())),
    s.fullscreen && h("p", { class: "small dim" }, `Fullscreen focus · ${s.escapes} escape${s.escapes === 1 ? "" : "s"}`),
    h("div", { class: "row" },
      h("button", {
        class: "btn btn--primary",
        onClick: async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url: s.problem.url });
          window.close();
        },
      }, "Go to problem"),
      h("button", { class: "btn btn--danger", onClick: () => void send({ type: "openAbort" }).then(() => window.close()) }, "Give up"),
    ),
    h("p", { class: "small dim" }, "Hints and \"I solved it\" are in the panel on the problem page."),
  ] as (HTMLElement | false)[]).filter(Boolean) as HTMLElement[];
}

function startForm(): HTMLElement[] {
  if (!problem) {
    return [h("p", { class: "dim" }, "Open a problem on leetcode.com or neetcode.io, then click Vantage Focus to start a session.")];
  }
  const p = problem;
  const minutes = h("input", {
    class: "input mono",
    type: "number",
    min: "1",
    max: "180",
    value: String(prefs.minutes),
    "aria-label": "Minutes",
    onInput: (e) => {
      prefs.minutes = Number((e.target as HTMLInputElement).value);
      syncPresets();
    },
  });
  const presets = [15, 25, 45].map((m) =>
    h("button", {
      class: "btn preset",
      type: "button",
      onClick: () => {
        prefs.minutes = m;
        minutes.value = String(m);
        syncPresets();
      },
    }, String(m)),
  );
  const syncPresets = () => presets.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.textContent) === prefs.minutes)));
  syncPresets();

  const modes = (Object.keys(MODE_LABELS) as Mode[]).map((m) =>
    h("label", { class: "mode" },
      h("input", {
        type: "radio",
        name: "mode",
        value: m,
        checked: prefs.mode === m,
        onChange: () => {
          prefs.mode = m;
        },
      }),
      h("span", {}, MODE_LABELS[m]),
      h("small", {}, MODE_DESCRIPTIONS[m]),
    ),
  );

  return [
    h("div", { class: "problem" },
      h("b", {}, p.title),
      h("span", { class: "small dim" }, p.platform === "leetcode" ? "LeetCode" : "NeetCode"),
    ),
    h("div", { class: "stack" }, h("span", { class: "label" }, "Minutes"), h("div", { class: "minutes" }, minutes, ...presets)),
    h("div", { class: "stack" }, h("span", { class: "label" }, "Lock mode"), h("div", { class: "modes" }, ...modes)),
    fullscreenOption(),
    h("button", {
      class: "btn btn--primary",
      disabled: busy,
      onClick: () =>
        void run(async () => {
          await chrome.storage.local.set({ [PREFS_KEY]: prefs });
          const res = await send<Session>({
            type: "start",
            problem: p,
            mode: prefs.mode,
            minutes: prefs.minutes,
            fullscreen: prefs.fullscreen && incognitoAllowed,
            siren: prefs.siren,
            tabId: problemTabId,
          });
          if (!res.ok) throw new Error(res.error);
          session = res.data;
        }),
    }, "Start session"),
    errorLine(),
    !friendly &&
      h("p", { class: "small dim" },
        "Blocked sites show Chrome's error page. ",
        h("button", {
          class: "btn btn--link small",
          onClick: async () => {
            friendly = await chrome.permissions.request({ origins: ["<all_urls>"] });
            render();
          },
        }, "Show a Vantage page instead"),
        " (asks for access to all sites; only used to redirect blocked pages)."),
    h("p", { class: "small dim" }, "Turning the extension off or using Incognito gets around the lock, so it's only as strong as your intent."),
  ].filter(Boolean) as HTMLElement[];
}

function fullscreenOption(): HTMLElement {
  return h("div", { class: "stack" },
    h("label", { class: "mode" },
      h("input", {
        type: "checkbox",
        checked: prefs.fullscreen && incognitoAllowed,
        disabled: !incognitoAllowed,
        onChange: (e) => {
          prefs.fullscreen = (e.target as HTMLInputElement).checked;
          render(); // siren option depends on it
        },
      }),
      h("span", {}, "Fullscreen focus"),
      h("small", {}, "Goes fullscreen. Switching tabs, windows or apps pops up a flashing BAD sign and counts as an escape."),
    ),
    h("label", { class: "mode" },
      h("input", {
        type: "checkbox",
        checked: prefs.siren && prefs.fullscreen && incognitoAllowed,
        disabled: !prefs.fullscreen || !incognitoAllowed,
        onChange: (e) => {
          prefs.siren = (e.target as HTMLInputElement).checked;
        },
      }),
      h("span", {}, "Siren mode"),
      h("small", {}, "Also blares a siren until you're back on the problem. Needs Fullscreen focus."),
    ),
    !incognitoAllowed &&
      h("p", { class: "small dim" },
        "Needs \"Allow in Incognito\" so Incognito can't be used to dodge it. ",
        h("button", {
          class: "btn btn--link small",
          onClick: () => void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` }),
        }, "Turn it on"),
        ", then reopen this popup."),
  );
}

function footer(): HTMLElement | null {
  if (!auth?.email) return null;
  return h("div", { class: "foot small dim" },
    h("span", { style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, auth.email),
    !session &&
      h("button", {
        class: "btn btn--link small",
        onClick: () =>
          void run(async () => {
            const res = await send<AuthState>({ type: "signOut" });
            if (!res.ok) throw new Error(res.error);
            auth = res.data;
          }),
      }, "Sign out"),
  );
}

function render(): void {
  let body: HTMLElement[];
  if (!auth) body = [h("p", { class: "dim" }, "Loading…")];
  else if (!auth.email) body = signedOut();
  else if (session) body = active(session);
  else if (auth.hasAccess === false) body = noAccess();
  else body = startForm();

  app.replaceChildren(header(), ...body, ...[footer()].filter((x): x is HTMLElement => !!x));

  window.clearInterval(tick);
  if (session) {
    const s = session;
    tick = window.setInterval(() => {
      const el = document.getElementById("timer");
      if (el) el.textContent = formatRemaining(s.endsAt - Date.now());
    }, 500);
  }
}

async function init(): Promise<void> {
  render();
  const stored = (await chrome.storage.local.get(PREFS_KEY))[PREFS_KEY] as typeof prefs | undefined;
  if (stored) prefs = { ...prefs, ...stored };
  const [authRes, s, p, f, inc] = await Promise.all([
    send<AuthState>({ type: "getAuth" }),
    readSession(),
    currentProblem(),
    chrome.permissions.contains({ origins: ["<all_urls>"] }),
    chrome.extension.isAllowedIncognitoAccess(),
  ]);
  incognitoAllowed = inc;
  auth = authRes.ok ? authRes.data : { email: null, hasAccess: null };
  if (!authRes.ok) error = authRes.error;
  session = s;
  problem = p;
  friendly = f;
  render();
}

onSessionChange((s) => {
  session = s;
  render();
});

void init();
