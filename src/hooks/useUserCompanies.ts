import { useEffect, useMemo, useState } from "react";
import { getUserCompanies, saveUserCompany, type UserCompany, type UserCompanyFlags } from "../lib/userCompanies";

// Optimistic: the UI updates on click, the Supabase write follows in the
// background (not awaited).
export function useUserCompanies() {
  const [rows, setRows] = useState<UserCompany[]>([]);

  useEffect(() => {
    let cancelled = false;
    getUserCompanies().then((loaded) => {
      if (!cancelled) setRows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pin order is pin time, oldest first, so new pins land after existing ones.
  const pinned = useMemo(
    () =>
      rows
        .filter((r) => r.is_pinned)
        .sort((a, b) => (a.pinned_at ?? "").localeCompare(b.pinned_at ?? ""))
        .map((r) => r.company_name),
    [rows],
  );
  const inProcess = useMemo(() => new Set(rows.filter((r) => r.is_in_process).map((r) => r.company_name)), [rows]);

  function update(companyName: string, flags: UserCompanyFlags) {
    setRows((prev) => {
      const existing = prev.find((r) => r.company_name === companyName);
      if (existing) return prev.map((r) => (r === existing ? { ...r, ...flags } : r));
      return [...prev, { company_name: companyName, is_pinned: false, pinned_at: null, is_in_process: false, ...flags }];
    });
    void saveUserCompany(companyName, flags);
  }

  // In-process companies are always pinned, so unpinning one is a no-op —
  // the Pin button is disabled in that state anyway.
  function togglePin(companyName: string) {
    if (inProcess.has(companyName)) return;
    const isPinned = pinned.includes(companyName);
    update(companyName, { is_pinned: !isPinned, pinned_at: isPinned ? null : new Date().toISOString() });
  }

  // Marking a company in process also pins it (keeping its original pin time
  // if already pinned). Clearing in process leaves the pin alone.
  function toggleInProcess(companyName: string) {
    if (inProcess.has(companyName)) {
      update(companyName, { is_in_process: false });
    } else if (pinned.includes(companyName)) {
      update(companyName, { is_in_process: true });
    } else {
      update(companyName, { is_in_process: true, is_pinned: true, pinned_at: new Date().toISOString() });
    }
  }

  return { pinned, inProcess, togglePin, toggleInProcess };
}
