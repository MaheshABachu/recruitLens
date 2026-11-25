import { useCallback, useEffect, useRef, useState } from "react";
import { getBlockedCompanies, saveBlockedCompanies, type AlertCompany } from "../lib/alerts";

// The job-alert blocked list (alert_excluded_companies) plus the "Block defense
// tech" switch, for the job boards' "Hide blocked companies" filter. Edits are
// optimistic and saved right away; a failed save rolls back and sets `error`.
// Pass null while signed out.
export function useBlockedCompanies(userId: string | null) {
  const [excluded, setExcluded] = useState<AlertCompany[]>([]);
  const [excludeDefense, setExcludeDefense] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Last saved list, so each save diffs against what's in the database.
  const saved = useRef<AlertCompany[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getBlockedCompanies().then((loaded) => {
      if (cancelled || !loaded) return;
      saved.current = loaded.excluded;
      setExcluded(loaded.excluded);
      setExcludeDefense(loaded.excludeDefense);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const update = useCallback(async (next: AlertCompany[]) => {
    const previous = saved.current;
    saved.current = next;
    setExcluded(next);
    setError(null);
    const ok = await saveBlockedCompanies(next, previous);
    if (!ok && saved.current === next) {
      saved.current = previous;
      setExcluded(previous);
      setError("Couldn't save your blocked companies. Try again.");
    }
  }, []);

  return { excluded, excludeDefense, update, error };
}
