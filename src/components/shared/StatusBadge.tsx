import type { PipelineStatus } from "../../types/pipeline";

const STATUS_CLASS: Record<PipelineStatus, string> = {
  "Not Applied": "status-badge--neutral",
  Applied: "status-badge--applied",
  OA: "status-badge--active",
  "Phone Screen": "status-badge--active",
  Onsite: "status-badge--active",
  Offer: "status-badge--offer",
  Rejected: "status-badge--rejected",
};

export function StatusBadge({ status }: { status: PipelineStatus }) {
  return <span className={`status-badge ${STATUS_CLASS[status]}`}>{status}</span>;
}
