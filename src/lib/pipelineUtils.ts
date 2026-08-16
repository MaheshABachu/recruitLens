import type { PipelineStatus, Role } from "../types/pipeline";

/** The five forward-moving stages shown as nodes on the pipeline tracker. */
export const FORWARD_STAGES: PipelineStatus[] = [
  "Applied",
  "OA",
  "Phone Screen",
  "Onsite",
  "Offer",
];

/** Rank used to pick the "furthest" status across a company's roles. Rejected
 * ranks just above Not Applied — it still reflects real activity happened. */
const STATUS_RANK: Record<PipelineStatus, number> = {
  "Not Applied": 0,
  Rejected: 1,
  Applied: 2,
  OA: 3,
  "Phone Screen": 4,
  Onsite: 5,
  Offer: 6,
};

export function furthestStatus(roles: Role[]): PipelineStatus {
  if (roles.length === 0) return "Not Applied";
  return roles.reduce<PipelineStatus>(
    (furthest, role) =>
      STATUS_RANK[role.status] > STATUS_RANK[furthest] ? role.status : furthest,
    roles[0].status,
  );
}

export type StageState = "done" | "current" | "upcoming";

/** Where a given forward stage sits relative to a role's current status. */
export function stageState(status: PipelineStatus, stage: PipelineStatus): StageState {
  if (status === "Rejected" || status === "Not Applied") return "upcoming";
  const stageIdx = FORWARD_STAGES.indexOf(stage);
  const statusIdx = FORWARD_STAGES.indexOf(status);
  if (stageIdx < statusIdx) return "done";
  if (stageIdx === statusIdx) return "current";
  return "upcoming";
}

export function statusLabel(status: PipelineStatus): string {
  return status;
}
