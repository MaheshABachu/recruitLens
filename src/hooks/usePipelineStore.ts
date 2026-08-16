import { useMemo, useState } from "react";
import { mockCompanies } from "../data/mockCompanies";
import type { Company, Role } from "../types/pipeline";

/**
 * Owns all Pipeline state and mutations. Seeded from mockCompanies today;
 * when real persistence lands, only the inside of this hook changes (a
 * Supabase query + mutation instead of useState) — every caller keeps the
 * same API. Components must go through these actions, never read
 * mockCompanies or setState directly.
 */
export function usePipelineStore() {
  const [companies, setCompanies] = useState<Company[]>(mockCompanies);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(
    mockCompanies[0]?.id ?? null,
  );
  const [activeRoleIndex, setActiveRoleIndex] = useState(0);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const activeRole = activeCompany?.roles[activeRoleIndex] ?? null;

  function selectCompany(id: string) {
    setActiveCompanyId(id);
    setActiveRoleIndex(0);
  }

  function selectRole(index: number) {
    setActiveRoleIndex(index);
  }

  function togglePriority(companyId: string) {
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, priority: !c.priority } : c)),
    );
  }

  function updateRoleField<K extends keyof Role>(
    companyId: string,
    roleIndex: number,
    field: K,
    value: Role[K],
  ) {
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== companyId) return c;
        const roles = c.roles.map((r, i) =>
          i === roleIndex ? { ...r, [field]: value } : r,
        );
        return { ...c, roles };
      }),
    );
  }

  // Adds a company discovered via an external source (e.g. the email agent)
  // with a single starter role. Returns the created company synchronously so
  // callers don't have to wait on the next render to reference its id.
  function addCompany(input: { name: string; status: Role["status"] }): Company {
    const newCompany: Company = {
      id: crypto.randomUUID(),
      name: input.name,
      group: "OTHER",
      tier: "Tier 4",
      problems: 0,
      priority: false,
      roles: [{ role: "Application", status: input.status }],
    };
    setCompanies((prev) => [...prev, newCompany]);
    return newCompany;
  }

  function appendRoleNote(companyId: string, roleIndex: number, note: string) {
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== companyId) return c;
        const roles = c.roles.map((r, i) =>
          i === roleIndex ? { ...r, notes: r.notes ? `${r.notes}\n${note}` : note } : r,
        );
        return { ...c, roles };
      }),
    );
  }

  return {
    companies,
    activeCompany,
    activeRole,
    activeRoleIndex,
    selectCompany,
    selectRole,
    togglePriority,
    updateRoleField,
    addCompany,
    appendRoleNote,
  };
}
