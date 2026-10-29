import { useEffect, useState } from "react";
import { getSolvedProblemSlugs } from "../lib/leetcode";

// `version` is leetcode_account.last_changed_at — refetches whenever a sync
// pulls in new submissions.
export function useLeetCodeSolvedSlugs(version: string | null) {
  const [solvedSlugs, setSolvedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getSolvedProblemSlugs().then((slugs) => {
      if (!cancelled) setSolvedSlugs(slugs);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return solvedSlugs;
}
