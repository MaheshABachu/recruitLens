import { useState } from "react";
import type { AgentLogEntry } from "../../hooks/useEmailAgent";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StageArrow({ actionTaken }: { actionTaken: string }) {
  const match = actionTaken.match(/Updated status: (.+) → (.+)/);
  if (!match) return null;
  return (
    <span className="email-log__stages">
      <span className="tag">{match[1]}</span>
      <span className="email-log__arrow">→</span>
      <span className="tag tag--accent">{match[2]}</span>
    </span>
  );
}

interface RecentUpdatesProps {
  agentLog: AgentLogEntry[];
  onUndo: (entry: AgentLogEntry) => void;
}

export function RecentUpdates({ agentLog, onUndo }: RecentUpdatesProps) {
  const updates = agentLog.filter((l) => l.action_taken.startsWith("Updated status:")).slice(0, 5);
  if (updates.length === 0) return null;

  return (
    <div className="email-log">
      <h4 className="email-log__title">Recent pipeline updates</h4>
      {updates.map((entry) => {
        const undone = entry.action_taken.includes("[undone]");
        return (
          <div key={entry.id} className={`email-log__row ${undone ? "email-log__row--undone" : ""}`}>
            <div className="email-log__main">
              <div className="email-log__heading">
                <span className="email-log__company">{entry.company_name || "Unknown"}</span>
                <StageArrow actionTaken={entry.action_taken} />
                {undone && <span className="email-log__undone-tag">undone</span>}
              </div>
              <p className="email-log__subject">{entry.subject}</p>
              <p className="email-log__date">{fmtDate(entry.processed_at)}</p>
            </div>
            {!undone && (
              <button type="button" className="email-log__undo" onClick={() => onUndo(entry)}>
                Undo
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FullAgentLog({ agentLog }: { agentLog: AgentLogEntry[] }) {
  const [open, setOpen] = useState(false);
  if (agentLog.length === 0) return null;

  return (
    <div className="email-log-full">
      <button type="button" className="email-log-full__toggle" onClick={() => setOpen((o) => !o)}>
        <span>Full agent log ({agentLog.length})</span>
        <span aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="email-log-full__table-wrap">
          <table className="email-log-full__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Subject</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {agentLog.map((entry) => {
                const isUpdate = entry.action_taken.startsWith("Updated status:");
                const isLow = entry.action_taken.startsWith("Low confidence");
                const isSkipped = entry.action_taken.startsWith("Skipped");
                const rowClass = isUpdate
                  ? "email-log-full__row--update"
                  : isLow
                    ? "email-log-full__row--low"
                    : isSkipped
                      ? "email-log-full__row--skipped"
                      : "";
                return (
                  <tr key={entry.id} className={rowClass}>
                    <td>{fmtDate(entry.processed_at)}</td>
                    <td>{entry.company_name || "—"}</td>
                    <td className="email-log-full__subject">{entry.subject}</td>
                    <td>{entry.action_taken}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
