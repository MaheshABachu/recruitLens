export type PipelineStatus =
  | "Not Applied"
  | "Applied"
  | "OA"
  | "Phone Screen"
  | "Onsite"
  | "Offer"
  | "Rejected";

export interface Role {
  id: string;
  role: string;
  status: PipelineStatus;
  nextAction?: string;
  nextDate?: string;
  recruiter?: string;
  format?: string;
  notes?: string;
  style?: string;
  resumeUsed?: string;
  resumeMatch?: number;
  coverLetterUsed?: string;
}

export interface Company {
  id: string;
  name: string;
  group: string;
  problems: number;
  priority: boolean;
  roles: Role[];
}
