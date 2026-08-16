import type { AgentLogEntry } from "../../hooks/useEmailAgent";

interface SuggestionReviewProps {
  entries: AgentLogEntry[];
  onApprove: (entry: AgentLogEntry) => void;
  onReject: (entry: AgentLogEntry) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
}

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

interface CompanyGroup {
  company_name: string;
  entries: AgentLogEntry[];
}

// Groups consecutive-or-not suggestions by company name (case-insensitive)
// so a company with several pending changes renders as one box instead of
// several identical-looking rows.
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
  return groups;
}

export function SuggestionReview({ entries, onApprove, onReject, onApproveAll, onRejectAll }: SuggestionReviewProps) {
  if (entries.length === 0) return null;

  const groups = groupByCompany(entries);

  return (
    <section className="suggestion-review">
      <div className="suggestion-review__header">
        <h4 className="suggestion-review__title">Suggested changes ({entries.length})</h4>
        <div className="suggestion-review__bulk">
          <button type="button" className="suggestion-review__bulk-btn" onClick={onRejectAll}>
            Reject all
          </button>
          <button
            type="button"
            className="suggestion-review__bulk-btn suggestion-review__bulk-btn--accent"
            onClick={onApproveAll}
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

          {group.entries.map((entry) => (
            <div key={entry.id} className="suggestion-review__row">
              <div className="suggestion-review__main">
                <span className="tag tag--accent">{kindLabel(entry)}</span>
                <p className="suggestion-review__detail">{entry.action_taken.replace(/^Suggested: /, "")}</p>
                <p className="suggestion-review__subject">{entry.subject}</p>
              </div>
              <div className="suggestion-review__actions">
                <button type="button" className="suggestion-review__reject" onClick={() => onReject(entry)}>
                  Reject
                </button>
                <button type="button" className="suggestion-review__approve" onClick={() => onApprove(entry)}>
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
