import "../lib/page.css";
import "./pages.css";
import { normalizeTyping } from "../lib/passages";
import { onSessionChange, send } from "../lib/types";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const typed = $<HTMLTextAreaElement>("typed");
const passageEl = $("passage");

let target = "";
let submitting = false;

function paint(): void {
  const got = normalizeTyping(typed.value);
  // Compare against the normalized passage, one character at a time, so a
  // mistake shows exactly where it is.
  let ok = 0;
  while (ok < got.length && ok < target.length && got[ok] === target[ok]) ok++;
  const wrong = got.length > ok ? Math.min(got.length, target.length) - ok : 0;

  const frag = document.createDocumentFragment();
  const span = (cls: string, text: string) => {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  };
  frag.append(span("ok", target.slice(0, ok)));
  if (wrong) frag.append(span("bad", target.slice(ok, ok + wrong)));
  const rest = target.slice(ok + wrong);
  if (rest) frag.append(span("cursor", rest[0]), rest.slice(1));
  passageEl.replaceChildren(frag);

  $("bar").style.width = `${Math.round((ok / target.length) * 100)}%`;
  $("count").textContent = `${ok} / ${target.length} characters`;
  $("state").textContent = got.length > ok ? "Fix the red part to keep going" : "";

  if (got === target && !submitting) void finish();
}

async function finish(): Promise<void> {
  submitting = true;
  $("error").textContent = "";
  const res = await send<boolean>({ type: "abortComplete", typed: typed.value });
  if (res.ok) {
    $("card").replaceChildren(
      Object.assign(document.createElement("h1"), { textContent: "Session ended" }),
      Object.assign(document.createElement("p"), { className: "dim", textContent: "Your browser is unlocked. You can close this tab." }),
    );
    return;
  }
  submitting = false;
  $("error").textContent = res.error;
  // Too fast: retry once the minimum time has passed.
  if (/fast/.test(res.error)) setTimeout(() => !submitting && normalizeTyping(typed.value) === target && void finish(), 5000);
}

for (const ev of ["paste", "drop", "contextmenu", "copy", "cut"]) {
  typed.addEventListener(ev, (e) => e.preventDefault());
}
typed.addEventListener("beforeinput", (e) => {
  if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop" || e.inputType === "insertReplacementText") {
    e.preventDefault();
  }
});
typed.addEventListener("input", paint);

async function init(): Promise<void> {
  const res = await send<{ source: string; text: string }>({ type: "abortBegin" });
  if (!res.ok) {
    $("none").hidden = false;
    return;
  }
  target = normalizeTyping(res.data.text);
  $("source").textContent = `- ${res.data.source}`;
  $("gate").hidden = false;
  $("gate").style.display = "grid";
  $("gate").style.gap = "12px";
  paint();
  typed.focus();
}

// Session ended some other way (timer ran out) while this tab was open.
onSessionChange((s) => {
  if (!s && !submitting) {
    $("card").replaceChildren(
      Object.assign(document.createElement("h1"), { textContent: "Session already over" }),
      Object.assign(document.createElement("p"), { className: "dim", textContent: "Nothing to unlock. You can close this tab." }),
    );
  }
});

void init();
