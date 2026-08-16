import { useEffect, useState } from "react";

interface SyncSummaryProps {
  summary: string | null;
}

// Reveals `text` a few characters at a time, like a chat message streaming in.
function useTypewriter(text: string | null): string {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!text) {
      setShown("");
      return;
    }
    setShown("");
    let i = 0;
    const CHARS_PER_TICK = 3;
    const interval = setInterval(() => {
      i += CHARS_PER_TICK;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [text]);

  return shown;
}

export function SyncSummary({ summary }: SyncSummaryProps) {
  const typed = useTypewriter(summary);
  const isTyping = !!summary && typed.length < summary.length;

  if (!summary) return null;

  return (
    <section className="email-summary">
      <div className="email-summary__bubble">
        <span className="email-summary__avatar" aria-hidden="true">
          ✦
        </span>
        <div className="email-summary__text">
          {typed}
          {isTyping && <span className="email-summary__cursor" aria-hidden="true" />}
        </div>
      </div>
    </section>
  );
}
