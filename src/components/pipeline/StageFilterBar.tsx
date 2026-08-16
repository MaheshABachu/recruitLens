import type { PipelineStatus } from "../../types/pipeline";

export type SortOption = "stage" | "priority" | "name";

const STAGES: PipelineStatus[] = ["Not Applied", "Applied", "OA", "Phone Screen", "Onsite", "Offer", "Rejected"];

interface StageFilterBarProps {
  counts: Map<PipelineStatus, number>;
  total: number;
  activeStage: PipelineStatus | "All";
  onSelectStage: (stage: PipelineStatus | "All") => void;
  sortBy: SortOption;
  onChangeSort: (sort: SortOption) => void;
}

export function StageFilterBar({
  counts,
  total,
  activeStage,
  onSelectStage,
  sortBy,
  onChangeSort,
}: StageFilterBarProps) {
  return (
    <div className="stage-filter">
      <select
        className="stage-filter__select"
        value={activeStage}
        onChange={(e) => onSelectStage(e.target.value as PipelineStatus | "All")}
        aria-label="Filter by stage"
      >
        <option value="All">All ({total})</option>
        {STAGES.map((stage) => {
          const count = counts.get(stage) ?? 0;
          if (count === 0) return null;
          return (
            <option key={stage} value={stage}>
              {stage} ({count})
            </option>
          );
        })}
      </select>

      <select
        className="stage-filter__select"
        value={sortBy}
        onChange={(e) => onChangeSort(e.target.value as SortOption)}
        aria-label="Sort companies"
      >
        <option value="stage">Sort: Stage</option>
        <option value="priority">Sort: Priority</option>
        <option value="name">Sort: Name</option>
      </select>
    </div>
  );
}
