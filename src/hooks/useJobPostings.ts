import { useEffect, useState } from "react";
import { getJobPostings, type PostingKind } from "../lib/jobPostings";
import type { JobPosting } from "../types/jobPosting";

// Loaded once on mount, same "fetch on mount, no caching" pattern as
// useCompanyQuestions — the Jobs and Internships tabs are only mounted while active.
export function useJobPostings(kind: PostingKind) {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJobPostings(kind).then((rows) => {
      if (!cancelled) {
        setPostings(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  return { postings, loading };
}
