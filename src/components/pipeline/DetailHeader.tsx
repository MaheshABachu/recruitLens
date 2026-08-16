import type { Company } from "../../types/pipeline";
import { Tag } from "../shared/Tag";
import { RoleSelect } from "./RoleSelect";

interface DetailHeaderProps {
  company: Company;
  activeRoleIndex: number;
  onSelectRole: (index: number) => void;
  onTogglePriority: () => void;
}

export function DetailHeader({
  company,
  activeRoleIndex,
  onSelectRole,
  onTogglePriority,
}: DetailHeaderProps) {
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
      </div>
    </div>
  );
}
