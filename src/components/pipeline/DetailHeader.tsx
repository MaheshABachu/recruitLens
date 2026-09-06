import type { Company } from "../../types/pipeline";
import { RoleSelect } from "./RoleSelect";

interface DetailHeaderProps {
  company: Company;
  activeRoleIndex: number;
  onSelectRole: (index: number) => void;
  onTogglePriority: () => void;
  onAddRole: () => void;
  onDelete: () => void;
}

export function DetailHeader({
  company,
  activeRoleIndex,
  onSelectRole,
  onTogglePriority,
  onAddRole,
  onDelete,
}: DetailHeaderProps) {
  return (
    <div className="detail-header">
      <div className="detail-header__title">
        <h1>{company.name}</h1>
      </div>
      <div className="detail-header__controls">
        {company.roles.length > 1 && (
          <RoleSelect roles={company.roles} activeIndex={activeRoleIndex} onChange={onSelectRole} />
        )}
        <button type="button" className="add-role-button" onClick={onAddRole}>
          <span aria-hidden="true">+</span> Add role
        </button>
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
          onClick={onDelete}
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
