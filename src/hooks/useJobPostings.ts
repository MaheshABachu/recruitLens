import { prefetch, useSwr } from "../lib/swrCache";
import { getJobPostings, type PostingKind } from "../lib/jobPostings";
import type { JobPosting } from "../types/jobPosting";

// Postings sync every 30 minutes; a copy younger than this is shown without
// refetching. Older copies (including last visit's, from IndexedDB) still
// render immediately and refresh in the background.
const MAX_AGE_MS = 5 * 60 * 1000;

const LOADERS: Record<PostingKind, () => Promise<JobPosting[]>> = {
  jobs: () => getJobPostings("jobs"),
  internships: () => getJobPostings("internships"),
};

const EMPTY: JobPosting[] = [];

export function useJobPostings(kind: PostingKind) {
  const { data, loading } = useSwr(`postings:${kind}`, LOADERS[kind], MAX_AGE_MS);
  return { postings: data ?? EMPTY, loading };
}

// Warm a tab's postings before the user opens it.
export function prefetchJobPostings(kind: PostingKind) {
  prefetch(`postings:${kind}`, LOADERS[kind], MAX_AGE_MS);
}
