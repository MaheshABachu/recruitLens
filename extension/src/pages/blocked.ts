import "../lib/page.css";
import "./pages.css";
import { formatRemaining, onSessionChange, readSession, send, type Session } from "../lib/types";

const params = new URLSearchParams(location.search);
// The original URL is appended raw after "u=" by the redirect rule, so take
// everything after it rather than trusting URLSearchParams to split it.
const original = location.search.split("u=").slice(1).join("u=");
const reason = params.get("reason");

const REASONS: Record<string, string> = {
  ai: "AI assistants are off during this session. Work it out yourself - that's the point.",
  solutions: "Walkthroughs and solutions are off during this session.",
  full: "Only LeetCode, NeetCode and Vantage are open during full lockdown.",
};

const $ = (id: string) => document.getElementById(id)!;
$("reason").textContent = REASONS[reason ?? ""] ?? REASONS.full;
$("url").textContent = original;
let session: Session | null = null;

$("back").addEventListener("click", () => {
  if (session) void send({ type: "focusProblem" });
  else if (/^https?:\/\//.test(original)) location.replace(original);
  else window.close();
});

function paint(): void {
  if (!session) {
    $("headline").textContent = "Session over";
    $("time").textContent = "Unlocked";
    $("back").textContent = original ? "Continue to the site" : "Close";
    return;
  }
  $("time").textContent = `${formatRemaining(session.endsAt - Date.now())} left on ${session.problem.title}`;
}

void readSession().then((s) => {
  session = s;
  paint();
});
onSessionChange((s) => {
  session = s;
  paint();
});
setInterval(paint, 500);
