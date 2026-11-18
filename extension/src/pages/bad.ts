import "../lib/page.css";
import "./pages.css";
import { formatRemaining, onSessionChange, readSession, send, type Session } from "../lib/types";

const stop = document.getElementById("stop")!;
const meta = document.getElementById("meta")!;
let session: Session | null = null;
let lastEscapes = -1;

function paint(): void {
  if (!session) {
    window.close();
    return;
  }
  const n = session.escapes;
  meta.textContent = `Escape #${n} · ${formatRemaining(session.endsAt - Date.now())} left`;
  if (n !== lastEscapes) {
    // Restart the flash (and shake) for each new escape.
    stop.classList.remove("stop-wrap--alarm");
    void stop.offsetWidth;
    stop.classList.add("stop-wrap--alarm");
    lastEscapes = n;
  }
}

document.getElementById("back")!.addEventListener("click", () => {
  void send({ type: "backToProblem" });
});

void readSession().then((s) => {
  session = s;
  paint();
});
onSessionChange((s) => {
  session = s;
  paint();
});
setInterval(paint, 1000);
