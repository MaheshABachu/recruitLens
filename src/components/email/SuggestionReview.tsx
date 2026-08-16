import { useEffect, useRef, useState } from "react";
import type { AgentLogEntry } from "../../hooks/useEmailAgent";
import type { PipelineStatus } from "../../types/pipeline";

interface SuggestionReviewProps {
  entries: AgentLogEntry[];
  onApprove: (entry: AgentLogEntry) => void;
  onReject: (entry: AgentLogEntry) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
}

// Matches the CSS transition duration on .suggestion-review__row--exiting.
const EXIT_DURATION_MS = 220;

// Ranked by how late in the application lifecycle the stage sits, not by
// forward-progress rank — Rejected is a terminal outcome that can follow any
// stage, so it ranks highest here and sorts to the top of a group.
const STATUS_RANK: Record<PipelineStatus, number> = {
  "Not Applied": 0,
  Applied: 1,
  OA: 2,
  "Phone Screen": 3,
  Onsite: 4,
  Offer: 5,
  Rejected: 6,
};

function kindLabel(entry: AgentLogEntry): string {
  switch (entry.pending?.kind) {
    case "new_company":
      return "New company";
    case "status_update":
      return "Status change";
    case "note_only":
      return "Note";
    default:
      return "Change";
  }
}

// What a suggestion is proposing to move the pipeline to, for sort purposes.
// note_only suggestions don't move a stage at all, so they sort last.
function suggestionRank(entry: AgentLogEntry): number {
  const status = entry.pending?.proposed_status ?? entry.pending?.current_status;
  return status ? STATUS_RANK[status] : -1;
}

interface CompanyGroup {
  company_name: string;
  entries: AgentLogEntry[];
}

// Groups consecutive-or-not suggestions by company name (case-insensitive)
// so a company with several pending changes renders as one box instead of
// several identical-looking rows. Within a group, the latest-lifecycle-stage
// suggestion sorts first (Rejected on top, Applied at the bottom) — approving
// the top card is always the most-decided outcome, and approving it
// auto-dismisses every other pending suggestion for that same company.
function groupByCompany(entries: AgentLogEntry[]): CompanyGroup[] {
  const groups: CompanyGroup[] = [];
  const byKey = new Map<string, CompanyGroup>();
  for (const entry of entries) {
    const name = entry.company_name || "Unknown";
    const key = name.toLowerCase();
    let group = byKey.get(key);
    if (!group) {
      group = { company_name: name, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  for (const group of groups) {
    group.entries.sort((a, b) => suggestionRank(b) - suggestionRank(a));
  }
  return groups;
}

export function SuggestionReview({ entries, onApprove, onReject, onApproveAll, onRejectAll }: SuggestionReviewProps) {
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  if (entries.length === 0) return null;

  const groups = groupByCompany(entries);

  function approveWithAnimation(entry: AgentLogEntry) {
    // Approving one suggestion auto-dismisses every other pending suggestion
    // for the same company (see approveSuggestion) — animate the whole group
    // out together so that isn't a surprise on the next render.
    const key = (entry.company_name || "").toLowerCase();
    const siblingIds = entries.filter((e) => e.id !== entry.id && (e.company_name || "").toLowerCase() === key);
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      siblingIds.forEach((e) => next.add(e.id));
      return next;
    });
    const timer = setTimeout(() => onApprove(entry), EXIT_DURATION_MS);
    timers.current.push(timer);
  }

  function rejectWithAnimation(entry: AgentLogEntry) {
    setExitingIds((prev) => new Set(prev).add(entry.id));
    const timer = setTimeout(() => onReject(entry), EXIT_DURATION_MS);
    timers.current.push(timer);
  }

  function approveAllWithAnimation() {
    setExitingIds((prev) => {
      const next = new Set(prev);
      entries.forEach((e) => next.add(e.id));
      return next;
    });
    const timer = setTimeout(() => onApproveAll(), EXIT_DURATION_MS);
    timers.current.push(timer);
  }

  function rejectAllWithAnimation() {
    setExitingIds((prev) => {
      const next = new Set(prev);
      entries.forEach((e) => next.add(e.id));
      return next;
    });
    const timer = setTimeout(() => onRejectAll(), EXIT_DURATION_MS);
    timers.current.push(timer);
  }

  return (
    <section className="suggestion-review">
      <div className="suggestion-review__header">
        <h4 className="suggestion-review__title">Suggested changes ({entries.length})</h4>
        <div className="suggestion-review__bulk">
          <button type="button" className="suggestion-review__bulk-btn" onClick={rejectAllWithAnimation}>
            Reject all
          </button>
          <button
            type="button"
            className="suggestion-review__bulk-btn suggestion-review__bulk-btn--accent"
            onClick={approveAllWithAnimation}
          >
            Approve all
          </button>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.company_name.toLowerCase()} className="suggestion-review__group">
          <div className="suggestion-review__group-heading">
            <span className="suggestion-review__company">{group.company_name}</span>
            {group.entries.length > 1 && (
              <span className="suggestion-review__group-count">{group.entries.length} changes</span>
            )}
          </div>

          {group.entries.map((entry) => {
            const isExiting = exitingIds.has(entry.id);
            return (
              <div
                key={entry.id}
                className={`suggestion-review__row ${isExiting ? "suggestion-review__row--exiting" : ""}`}
              >
                <div className="suggestion-review__main">
                  <span className="tag tag--accent">{kindLabel(entry)}</span>
                  <p className="suggestion-review__detail">{entry.action_taken.replace(/^Suggested: /, "")}</p>
                  <p className="suggestion-review__subject">{entry.subject}</p>
                </div>
                <div className="suggestion-review__actions">
                  <button
                    type="button"
                    className="suggestion-review__reject"
                    onClick={() => rejectWithAnimation(entry)}
                    disabled={isExiting}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="suggestion-review__approve"
                    onClick={() => approveWithAnimation(entry)}
                    disabled={isExiting}
                  >
                    Approve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
