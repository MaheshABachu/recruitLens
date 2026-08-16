import { useEffect, useState } from "react";
import { getSolvedProblemSlugs } from "../lib/leetcode";

export function useLeetCodeSolvedSlugs() {
  const [solvedSlugs, setSolvedSlugs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getSolvedProblemSlugs().then((slugs) => {
      if (!cancelled) setSolvedSlugs(slugs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return solvedSlugs;
}
