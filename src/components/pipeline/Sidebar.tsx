import { useMemo, useState } from "react";
import type { Company, PipelineStatus } from "../../types/pipeline";
import { furthestStatus } from "../../lib/pipelineUtils";
import { CompanySearch } from "./CompanySearch";
import { CompanyRow } from "./CompanyRow";
import { StageFilterBar, type SortOption } from "./StageFilterBar";

interface SidebarProps {
  companies: Company[];
  activeCompanyId: string | null;
  onSelectCompany: (id: string) => void;
  isDrawerOpen: boolean;
  onCloseDrawer: () => void;
}

const STAGE_RANK: Record<PipelineStatus, number> = {
  "Not Applied": 0,
  Rejected: 1,
  Applied: 2,
  OA: 3,
  "Phone Screen": 4,
  Onsite: 5,
  Offer: 6,
};

export function Sidebar({
  companies,
  activeCompanyId,
  onSelectCompany,
  isDrawerOpen,
  onCloseDrawer,
}: SidebarProps) {
  const [searchText, setSearchText] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStatus | "All">("All");
  const [sortBy, setSortBy] = useState<SortOption>("stage");

  const searched = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(query));
  }, [companies, searchText]);

  const stageCounts = useMemo(() => {
    const counts = new Map<PipelineStatus, number>();
    for (const c of searched) {
      const stage = furthestStatus(c.roles);
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return counts;
  }, [searched]);

  const filtered = useMemo(() => {
    if (stageFilter === "All") return searched;
    return searched.filter((c) => furthestStatus(c.roles) === stageFilter);
  }, [searched, stageFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "priority" && a.priority !== b.priority) return a.priority ? -1 : 1;
      return STAGE_RANK[furthestStatus(b.roles)] - STAGE_RANK[furthestStatus(a.roles)];
    });
    return list;
  }, [filtered, sortBy]);

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

        <StageFilterBar
          counts={stageCounts}
          total={searched.length}
          activeStage={stageFilter}
          onSelectStage={setStageFilter}
          sortBy={sortBy}
          onChangeSort={setSortBy}
        />

        <div className="sidebar__list">
          {sorted.length === 0 ? (
            <p className="sidebar__empty">
              {searchText ? `No companies match “${searchText}”.` : "No companies at this stage."}
            </p>
          ) : (
            sorted.map((company) => (
              <CompanyRow
                key={company.id}
                company={company}
                isActive={company.id === activeCompanyId}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
