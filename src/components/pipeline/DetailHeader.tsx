import type { Company } from "../../types/pipeline";
import { Tag } from "../shared/Tag";
import { RoleSelect } from "./RoleSelect";

interface DetailHeaderProps {
  company: Company;
  activeRoleIndex: number;
  onSelectRole: (index: number) => void;
  onTogglePriority: () => void;
  onDelete: () => void;
}

export function DetailHeader({
  company,
  activeRoleIndex,
  onSelectRole,
  onTogglePriority,
  onDelete,
}: DetailHeaderProps) {
  function handleDelete() {
    if (window.confirm(`Remove ${company.name} from your pipeline? This can't be undone.`)) {
      onDelete();
    }
  }

  return (
    <div className="detail-header">
      <div className="detail-header__title">
        <h1>{company.name}</h1>
        <Tag>{company.tier}</Tag>
      </div>
      <div className="detail-header__controls">
        {company.roles.length > 1 && (
          <RoleSelect roles={company.roles} activeIndex={activeRoleIndex} onChange={onSelectRole} />
        )}
        <button
          type="button"
          className={`priority-button ${company.priority ? "priority-button--active" : ""}`}
          onClick={onTogglePriority}
          aria-pressed={company.priority}
          aria-label={company.priority ? "Remove priority" : "Mark as priority"}
        >
          <span aria-hidden="true">★</span> Priority
        </button>
        <button
          type="button"
          className="delete-button"
          onClick={handleDelete}
          aria-label={`Remove ${company.name} from pipeline`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Delete
        </button>
      </div>
    </div>
  );
}
