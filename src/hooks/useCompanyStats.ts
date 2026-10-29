import { useEffect, useState } from "react";
import { getCompanyStats, type CompanyStats } from "../lib/companyStats";

// `names` is the visible tile list; `solvedVersion` is
// leetcode_account.last_changed_at, so solved counts refresh after a sync.
// Returns null until the first load finishes (tiles show a skeleton).
export function useCompanyStats(names: string[], solvedVersion: string | null) {
  const [stats, setStats] = useState<Map<string, CompanyStats> | null>(null);
  // Stable dependency: the tile array is rebuilt every render.
  const key = names.join("\u0000");

  useEffect(() => {
    let cancelled = false;
    getCompanyStats(key ? key.split("\u0000") : []).then((next) => {
      if (!cancelled) setStats(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key, solvedVersion]);

  return stats;
}
