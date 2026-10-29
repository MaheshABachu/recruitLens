import { useEffect, useState } from "react";
import { fetchLandingStats, type LandingStats } from "../lib/landingStats";

const EMPTY: LandingStats = { companies: null, questions: null, activeJobs: null };

// Same "fetch on mount, no caching" pattern as useLcCompanies.
export function useLandingStats() {
  const [stats, setStats] = useState<LandingStats>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    fetchLandingStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        // Leave nulls in place — the page renders fallback copy.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
