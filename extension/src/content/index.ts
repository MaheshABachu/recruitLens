import css from "./overlay.css?inline";
import { h } from "../lib/dom";
import {
  MODE_LABELS,
  STRUGGLE_LABELS,
  formatRemaining,
  onSessionChange,
  readSession,
  send,
  type ContentRequest,
  type HintBundle,
  type Session,
  type Struggle,
} from "../lib/types";
import {
  bounceFromSpoilerRoute,
  currentPlatform,
  describeProblem,
  hideSpoilers,
  problemSlug,
  restoreSpoilers,
  scrapePageHints,
} from "./sites";

// ---------- popup asks "what problem is this?" ----------

chrome.runtime.onMessage.addListener((req: ContentRequest, _sender, sendResponse) => {
  if (req.type === "describe") sendResponse(describeProblem());
  return false;
});

// Hints come from LeetCode/NeetCode as HTML. Keep basic formatting, drop
// everything else (scripts, handlers, links, images).
const ALLOWED = new Set(["B", "STRONG", "I", "EM", "CODE", "PRE", "BR", "P", "UL", "OL", "LI", "SUP", "SUB", "SPAN", "DIV"]);
function safeHtml(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const out = document.createDocumentFragment();
  const walk = (src: Node, dest: Node) => {
    for (const n of Array.from(src.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) dest.appendChild(document.createTextNode(n.textContent ?? ""));
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
        if (ALLOWED.has(el.tagName)) {
          const copy = document.createElement(el.tagName.toLowerCase());
          dest.appendChild(copy);
          walk(el, copy);
        } else walk(el, dest);
      }
    }
  };
  walk(doc.body.firstElementChild ?? doc.body, out);
  return out;
}

// ---------- per-session UI state (survives reloads) ----------

interface Revealed {
  struggle: Struggle | null;
  count: number;
  topics: boolean;
}
const revealedKey = (s: Session) => `vf-revealed:${s.id}`;
async function loadRevealed(s: Session): Promise<Revealed> {
  const key = revealedKey(s);
  return ((await chrome.storage.local.get(key))[key] as Revealed | undefined) ?? { struggle: null, count: 0, topics: false };
}
async function saveRevealed(s: Session, r: Revealed): Promise<void> {
  await chrome.storage.local.set({ [revealedKey(s)]: r });
}

// ---------- overlay ----------

let session: Session | null = null;
let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let tick: number | undefined;

type View = "none" | "picker" | "hints" | "abort-confirm";
const ui = {
  collapsed: false,
  view: "none" as View,
  bundle: null as HintBundle | null,
  revealed: { struggle: null, count: 0, topics: false } as Revealed,
  loading: false,
  note: null as { text: string; kind: "error" | "ok" | "info" } | null,
};

function mount(): void {
  if (host?.isConnected) return;
  host = document.createElement("vantage-focus");
  root = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);
}

function unmount(): void {
  host?.remove();
  host = null;
  root = null;
  window.clearInterval(tick);
  tick = undefined;
}

function onSessionProblem(s: Session): boolean {
  return currentPlatform() === s.problem.platform && problemSlug() === s.problem.slug;
}

function render(): void {
  if (!session) return unmount();
  mount();
  if (!root) return;
  const s = session;
  const left = s.endsAt - Date.now();

  const timer = h("span", { class: `time${left < 60_000 ? " time--low" : ""}` }, formatRemaining(left));
  const toggle = h("button", {
    class: "icon-btn",
    title: ui.collapsed ? "Expand" : "Collapse",
    onClick: () => {
      ui.collapsed = !ui.collapsed;
      render();
    },
  }, ui.collapsed ? "▴" : "▾");

  if (ui.collapsed) {
    root.replaceChildren(h("style", {}, css), h("div", { class: "card card--collapsed" }, h("div", { class: "bar" }, timer, toggle)));
    return;
  }

  const here = onSessionProblem(s);
  const escapes = s.fullscreen && s.escapes ? ` · ${s.escapes} escape${s.escapes === 1 ? "" : "s"}` : "";
  const meta = h("div", { class: "meta" }, h("b", {}, s.problem.title), MODE_LABELS[s.mode] + escapes);
  const bar = h("div", { class: "bar" }, timer, meta, toggle);

  const actions = h(
    "div",
    { class: "actions" },
    here
      ? h("button", { class: "btn btn--primary", onClick: openHints }, "Give me hints")
      : h("button", {
          class: "btn btn--primary",
          onClick: () => void send({ type: "focusProblem" }),
        }, "Back to problem"),
    h("button", { class: "btn", onClick: markSolved, disabled: ui.loading }, "I solved it"),
    h("button", {
      class: "btn btn--danger",
      onClick: () => {
        ui.view = ui.view === "abort-confirm" ? "none" : "abort-confirm";
        render();
      },
    }, "Give up"),
  );

  const note = ui.note && h("div", { class: `note note--${ui.note.kind}` }, ui.note.text);
  // Page-level fullscreen needs a click on the page itself; it's what lets us
  // make Esc press-and-hold instead of a single tap.
  const focus = s.fullscreen && here && !document.fullscreenElement &&
    h("div", { class: "actions" },
      h("button", { class: "btn btn--primary", onClick: () => void enterFocusMode() }, "Enter focus mode"),
    );
  root.replaceChildren(h("style", {}, css), h("div", { class: "card" }, bar, focus, actions, note, panel()));
}

// ---------- fullscreen focus mode ----------

interface KeyboardLock {
  lock(keys?: string[]): Promise<void>;
  unlock(): void;
}
const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
let inFocusMode = false;

async function enterFocusMode(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    inFocusMode = true;
    // Esc now has to be held down to leave fullscreen (Chrome shows a hint).
    await keyboard?.lock(["Escape"]).catch(() => undefined);
  } catch (e) {
    ui.note = { text: `Couldn't go fullscreen: ${e instanceof Error ? e.message : String(e)}`, kind: "error" };
  }
  render();
}

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) return;
  keyboard?.unlock();
  if (inFocusMode && session?.fullscreen) void send({ type: "escaped" });
  inFocusMode = false;
  render();
});

function leaveFocusMode(): void {
  inFocusMode = false;
  keyboard?.unlock();
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

function panel(): HTMLElement | null {
  if (!session) return null;
  if (ui.view === "abort-confirm") {
    return h(
      "div",
      { class: "panel" },
      h("h3", {}, "End this session early?"),
      h("p", {}, "To unlock the browser before the timer runs out, you'll type out a Shakespeare passage word for word. It takes about a minute and a half."),
      h("div", { class: "row" },
        h("button", { class: "btn", onClick: () => { ui.view = "none"; render(); } }, "Keep going"),
        h("button", { class: "btn btn--danger", onClick: () => void send({ type: "openAbort" }) }, "Open the passage"),
      ),
    );
  }

  if (ui.view === "picker") {
    return h(
      "div",
      { class: "panel" },
      h("h3", {}, "Where are you stuck?"),
      h("div", { class: "choices" },
        ...(Object.keys(STRUGGLE_LABELS) as Struggle[]).map((k) =>
          h("button", { class: "btn", disabled: ui.loading, onClick: () => void pickStruggle(k) }, STRUGGLE_LABELS[k]),
        ),
      ),
    );
  }

  if (ui.view === "hints" && ui.bundle) {
    const b = ui.bundle;
    const shown = b.hints.slice(0, ui.revealed.count);
    const remaining = b.hints.length - shown.length;
    return h(
      "div",
      { class: "panel" },
      h("div", { class: "tip" }, h("small", {}, ui.revealed.struggle ? STRUGGLE_LABELS[ui.revealed.struggle] : "Tip"), b.tip),
      b.hints.length === 0 && h("p", {}, "No hints for this problem."),
      ...shown.map((hint, i) =>
        h("div", { class: "hint" },
          h("small", {}, hint.kind === "complexity" ? "Complexity target" : `Hint ${i + 1}`),
          h("div", {}, safeHtml(hint.html)),
        ),
      ),
      ui.revealed.topics && b.topics.length > 0 &&
        h("div", { class: "hint" }, h("small", {}, "Topics"), h("div", { class: "tags" }, ...b.topics.map((t) => h("span", { class: "tag" }, t)))),
      h("div", { class: "row" },
        remaining > 0 &&
          h("button", { class: "btn btn--primary", onClick: () => void revealNext() },
            `Show hint ${shown.length + 1} of ${b.hints.length}`),
        !ui.revealed.topics && b.topics.length > 0 &&
          h("button", { class: "btn", onClick: () => void revealTopics() }, "Show topic tags"),
        h("button", { class: "btn", onClick: () => { ui.view = "picker"; render(); } }, "Stuck elsewhere"),
      ),
      b.source !== "none" && h("p", { style: "margin-top:8px;font-size:11px" }, `Hints from ${b.source === "neetcode" ? "NeetCode" : "LeetCode"}.`),
    );
  }
  return null;
}

async function openHints(): Promise<void> {
  if (!session) return;
  ui.note = null;
  if (ui.view === "hints" || ui.view === "picker") {
    ui.view = "none";
    return render();
  }
  ui.revealed = await loadRevealed(session);
  if (ui.revealed.struggle) await pickStruggle(ui.revealed.struggle);
  else {
    ui.view = "picker";
    render();
  }
}

async function pickStruggle(struggle: Struggle): Promise<void> {
  if (!session) return;
  ui.loading = true;
  render();
  const res = await send<HintBundle>({ type: "getHints", struggle, pageHints: scrapePageHints() });
  ui.loading = false;
  if (!res.ok) {
    ui.note = { text: res.error, kind: "error" };
    return render();
  }
  ui.bundle = res.data;
  ui.revealed = { ...ui.revealed, struggle };
  await saveRevealed(session, ui.revealed);
  ui.view = "hints";
  render();
}

async function revealNext(): Promise<void> {
  if (!session || !ui.bundle) return;
  ui.revealed = { ...ui.revealed, count: Math.min(ui.revealed.count + 1, ui.bundle.hints.length) };
  await saveRevealed(session, ui.revealed);
  void send({ type: "hintShown" });
  render();
}

async function revealTopics(): Promise<void> {
  if (!session) return;
  ui.revealed = { ...ui.revealed, topics: true };
  await saveRevealed(session, ui.revealed);
  void send({ type: "hintShown" });
  render();
}

async function markSolved(): Promise<void> {
  ui.loading = true;
  ui.note = { text: "Checking your submissions…", kind: "info" };
  render();
  const res = await send<boolean>({ type: "solved" });
  ui.loading = false;
  if (!res.ok) ui.note = { text: res.error, kind: "error" };
  else if (!res.data) {
    ui.note = {
      text: session?.problem.platform === "neetcode"
        ? "Haven't seen an accepted submission yet. Submit your solution first."
        : "No accepted submission for this problem yet. Submit on LeetCode first (it can take a few seconds to show up).",
      kind: "error",
    };
  }
  render();
}

// ---------- spoilers + NeetCode accepted detection ----------

let observer: MutationObserver | null = null;
let submitAt = 0;

function guardPage(): void {
  const s = session;
  const blockSpoilers = s && (s.mode === "solutions" || s.mode === "full");
  if (blockSpoilers) {
    bounceFromSpoilerRoute();
    hideSpoilers();
  }
  if (s && s.problem.platform === "neetcode" && !s.acceptedSeen && submitAt && Date.now() - submitAt < 90_000) {
    for (const el of document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, span, div, p")) {
      if (el.childElementCount === 0 && el.textContent?.trim() === "Accepted") {
        submitAt = 0;
        void send({ type: "neetcodeAccepted" });
        break;
      }
    }
  }
}

document.addEventListener(
  "click",
  (e) => {
    const target = (e.target as HTMLElement | null)?.closest("button");
    if (target?.textContent?.trim() === "Submit") submitAt = Date.now();
  },
  true,
);

function startGuards(): void {
  if (observer) return;
  let pending = false;
  observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      guardPage();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function stopGuards(): void {
  observer?.disconnect();
  observer = null;
  restoreSpoilers();
}

// ---------- wiring ----------

function apply(s: Session | null): void {
  const prevId = session?.id;
  session = s;
  if (!s) {
    leaveFocusMode();
    stopGuards();
    unmount();
    return;
  }
  if (s.id !== prevId) {
    ui.view = "none";
    ui.bundle = null;
    ui.note = null;
  }
  startGuards();
  guardPage();
  render();
  if (tick === undefined) {
    tick = window.setInterval(() => {
      // LeetCode is an SPA: re-check spoiler routes on every tick too.
      guardPage();
      if (!root) return;
      const time = root.querySelector(".time");
      if (time && session) {
        const left = session.endsAt - Date.now();
        time.textContent = formatRemaining(left);
        time.classList.toggle("time--low", left < 60_000);
      }
    }, 500);
  }
}

void readSession().then(apply);
onSessionChange(apply);
