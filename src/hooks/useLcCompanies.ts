import { useEffect, useState } from "react";
import { getLcCompanyNames } from "../lib/companyQuestions";

// Same "fetch on mount, no caching" pattern as useJobPostings — the Companies
// tab is only mounted while active, and the list is ~470 names.
export function useLcCompanies() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLcCompanyNames().then((names) => {
      if (!cancelled) {
        setCompanies(names);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { companies, loading };
}
