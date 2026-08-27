// Row shape of `job_postings`, populated by scripts/import-job-postings.ts.
// Not managed by this app at runtime — read-only from the frontend.
export interface JobPosting {
  id: string;
  company: string;
  companyUrl: string | null;
  title: string;
  location: string | null;
  url: string;
  category: string | null;
  workModel: string | null;
  salary: string | null;
  requiresUsCitizenship: boolean;
  noSponsorship: boolean;
  isFaang: boolean;
  advancedDegreeRequired: boolean;
  isClosed: boolean;
  datePosted: string | null;
  sources: string[];
}
