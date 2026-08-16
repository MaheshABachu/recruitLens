import type { Company } from "../../types/pipeline";
import { CompanyRow } from "./CompanyRow";

interface CompanyGroupProps {
  name: string;
  companies: Company[];
  activeCompanyId: string | null;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectCompany: (id: string) => void;
}

export function CompanyGroup({
  name,
  companies,
  activeCompanyId,
  isCollapsed,
  onToggleCollapsed,
  onSelectCompany,
}: CompanyGroupProps) {
  return (
    <div className="company-group">
      <button
        type="button"
        className="company-group__header"
        onClick={onToggleCollapsed}
        aria-expanded={!isCollapsed}
      >
        <span
          className={`company-group__chevron ${isCollapsed ? "company-group__chevron--collapsed" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
        <span className="company-group__name">{name}</span>
        <span className="company-group__count">{companies.length}</span>
      </button>
      {!isCollapsed && (
        <div className="company-group__list">
          {companies.map((company) => (
            <CompanyRow
              key={company.id}
              company={company}
              isActive={company.id === activeCompanyId}
              onSelect={onSelectCompany}
            />
          ))}
        </div>
      )}
    </div>
  );
}
