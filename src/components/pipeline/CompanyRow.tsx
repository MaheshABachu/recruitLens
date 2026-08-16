import type { Company } from "../../types/pipeline";
import { furthestStatus } from "../../lib/pipelineUtils";
import { StatusBadge } from "../shared/StatusBadge";

interface CompanyRowProps {
  company: Company;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export function CompanyRow({ company, isActive, onSelect }: CompanyRowProps) {
  const status = furthestStatus(company.roles);

  return (
    <button
      type="button"
      className={`company-row ${isActive ? "company-row--active" : ""}`}
      onClick={() => onSelect(company.id)}
      aria-current={isActive ? "true" : undefined}
    >
      <span className="company-row__main">
        <span className="company-row__name">
          {company.priority && (
            <span className="company-row__priority" aria-hidden="true">
              ★
            </span>
          )}
          {company.name}
        </span>
        {company.roles.length > 1 && (
          <span className="company-row__meta">{company.roles.length} roles</span>
        )}
      </span>
      <StatusBadge status={status} />
    </button>
  );
}
