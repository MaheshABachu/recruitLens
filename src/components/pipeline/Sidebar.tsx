import { useMemo, useState } from "react";
import type { Company } from "../../types/pipeline";
import { CompanySearch } from "./CompanySearch";
import { CompanyGroup } from "./CompanyGroup";

interface SidebarProps {
  companies: Company[];
  activeCompanyId: string | null;
  onSelectCompany: (id: string) => void;
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
}

function groupCompanies(companies: Company[]): Map<string, Company[]> {
  const groups = new Map<string, Company[]>();
  for (const company of companies) {
    const bucket = groups.get(company.group);
    if (bucket) bucket.push(company);
    else groups.set(company.group, [company]);
  }
  return groups;
}

export function Sidebar({
  companies,
  activeCompanyId,
  onSelectCompany,
  isDrawerOpen,
  onCloseDrawer,
}: SidebarProps) {
  const [searchText, setSearchText] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(query));
  }, [companies, searchText]);

  const grouped = useMemo(() => groupCompanies(filtered), [filtered]);

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleSelect(id: string) {
    onSelectCompany(id);
    onCloseDrawer();
  }

  return (
    <>
      {isDrawerOpen && (
        <div className="sidebar-backdrop" onClick={onCloseDrawer} aria-hidden="true" />
      )}
      <aside className={`sidebar ${isDrawerOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__search">
          <CompanySearch value={searchText} onChange={setSearchText} />
          <button type="button" className="add-company-button">
            <span aria-hidden="true">+</span> Add company
          </button>
        </div>
        <div className="sidebar__list">
          {grouped.size === 0 ? (
            <p className="sidebar__empty">No companies match “{searchText}”.</p>
          ) : (
            Array.from(grouped.entries()).map(([name, groupCompanies]) => (
              <CompanyGroup
                key={name}
                name={name}
                companies={groupCompanies}
                activeCompanyId={activeCompanyId}
                isCollapsed={collapsedGroups.has(name)}
                onToggleCollapsed={() => toggleGroup(name)}
                onSelectCompany={handleSelect}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
