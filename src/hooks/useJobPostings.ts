import { useEffect, useState } from "react";
import { getJobPostings } from "../lib/jobPostings";
import type { JobPosting } from "../types/jobPosting";

// Loaded once on mount, same "fetch on mount, no caching" pattern as
// useCompanyQuestions — the Jobs tab is only mounted while active.
export function useJobPostings() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJobPostings().then((rows) => {
      if (!cancelled) {
        setPostings(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { postings, loading };
}
