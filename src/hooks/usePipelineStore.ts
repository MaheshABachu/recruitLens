import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Company, PipelineStatus, Role } from "../types/pipeline";

interface RoleRow {
  id: string;
  role: string;
  status: PipelineStatus;
  next_action: string | null;
  next_date: string | null;
  recruiter: string | null;
  format: string | null;
  notes: string | null;
  style: string | null;
  resume_used: string | null;
  resume_match: number | null;
  cover_letter_used: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  category: string;
  problems: number;
  priority: boolean;
  roles: RoleRow[];
}

function dbRoleToRole(row: RoleRow): Role {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    nextAction: row.next_action ?? undefined,
    nextDate: row.next_date ?? undefined,
    recruiter: row.recruiter ?? undefined,
    format: row.format ?? undefined,
    notes: row.notes ?? undefined,
    style: row.style ?? undefined,
    resumeUsed: row.resume_used ?? undefined,
    resumeMatch: row.resume_match ?? undefined,
    coverLetterUsed: row.cover_letter_used ?? undefined,
  };
}

function dbCompanyToCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    group: row.category,
    problems: row.problems,
    priority: row.priority,
    roles: row.roles.map(dbRoleToRole),
  };
}

// camelCase Role field -> snake_case roles table column. Only fields that
// actually have a DB column belong here (excludes id/role, which never
// change through updateRoleField).
const ROLE_FIELD_TO_COLUMN: Partial<Record<keyof Role, string>> = {
  status: "status",
  nextAction: "next_action",
  nextDate: "next_date",
  recruiter: "recruiter",
  format: "format",
  notes: "notes",
  style: "style",
  resumeUsed: "resume_used",
  resumeMatch: "resume_match",
  coverLetterUsed: "cover_letter_used",
};

function logSyncError(action: string, error: unknown) {
  if (error) console.error(`Supabase sync failed (${action}):`, error);
}

// All background Supabase writes go through this single FIFO chain instead
// of firing as independent concurrent requests. Without it, e.g. addCompany's
// insert and an immediately-following updateRoleField's update (both fired
// optimistically, neither awaited by its caller) can reach Postgres out of
// order — the update finding no matching row yet and silently affecting
// nothing. Queuing makes every write wait for the previous one to actually
// land before it fires, while staying fully non-blocking for callers, who
// only ever see the synchronous local state update.
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(action: string, op: () => PromiseLike<{ error: unknown }>) {
  writeQueue = writeQueue.then(async () => {
    const { error } = await op();
    logSyncError(action, error);
  });
}

/**
 * Owns all Pipeline state and mutations. Backed by Supabase (`companies` +
 * `roles` tables, scoped to `userId` — pass `null` until the auth session
 * resolves) — hydrates once `userId` is available, then every mutation
 * updates local state immediately and fires the matching Supabase write in
 * the background (optimistic — callers never await a network round trip).
 * Components must go through these actions, never read or setState directly.
 */
export function usePipelineStore(userId: string | null) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [activeRoleIndex, setActiveRoleIndex] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("companies")
        .select("*, roles(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .order("created_at", { referencedTable: "roles", ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("Failed to load companies:", error);
      } else {
        setCompanies(((data ?? []) as CompanyRow[]).map(dbCompanyToCompany));
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
    const company = companies.find((c) => c.id === companyId);
    if (!company) return;
    const nextPriority = !company.priority;

    setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, priority: nextPriority } : c)));

    enqueueWrite("togglePriority", () =>
      supabase.from("companies").update({ priority: nextPriority }).eq("id", companyId).eq("user_id", userId),
    );
  }

  function updateRoleField<K extends keyof Role>(
    companyId: string,
    roleIndex: number,
    field: K,
    value: Role[K],
  ) {
    const roleId = companies.find((c) => c.id === companyId)?.roles[roleIndex]?.id;

    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== companyId) return c;
        const roles = c.roles.map((r, i) => (i === roleIndex ? { ...r, [field]: value } : r));
        return { ...c, roles };
      }),
    );

    const column = ROLE_FIELD_TO_COLUMN[field];
    if (roleId && column) {
      enqueueWrite("updateRoleField", () =>
        supabase
          .from("roles")
          .update({ [column]: value ?? null })
          .eq("id", roleId),
      );
    }
  }

  // Adds a company discovered via an external source (e.g. the email agent)
  // with a single starter role. IDs are generated client-side so the new
  // company is usable synchronously — the Supabase insert happens after,
  // in the background, using those same IDs.
  function addCompany(input: { name: string; status: Role["status"] }): Company {
    const companyId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const newCompany: Company = {
      id: companyId,
      name: input.name,
      group: "OTHER",
      problems: 0,
      priority: false,
      roles: [{ id: roleId, role: "Application", status: input.status }],
    };
    setCompanies((prev) => [...prev, newCompany]);

    // Queued in order — the role insert only actually reaches Postgres
    // after the company insert has, since both share the same write queue.
    enqueueWrite("addCompany", () =>
      supabase
        .from("companies")
        .insert({ id: companyId, name: input.name, category: "OTHER", problems: 0, priority: false, user_id: userId }),
    );
    enqueueWrite("addCompany (role)", () =>
      supabase.from("roles").insert({ id: roleId, company_id: companyId, role: "Application", status: input.status }),
    );

    return newCompany;
  }

  function deleteCompany(companyId: string) {
    setCompanies((prev) => prev.filter((c) => c.id !== companyId));
    setActiveCompanyId((prev) => (prev === companyId ? null : prev));
    setActiveRoleIndex(0);

    // roles cascade-delete in the DB via the company_id foreign key.
    enqueueWrite("deleteCompany", () =>
      supabase.from("companies").delete().eq("id", companyId).eq("user_id", userId),
    );
  }

  function appendRoleNote(companyId: string, roleIndex: number, note: string) {
    const role = companies.find((c) => c.id === companyId)?.roles[roleIndex];
    if (!role) return;
    const nextNotes = role.notes ? `${role.notes}\n${note}` : note;

    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== companyId) return c;
        const roles = c.roles.map((r, i) => (i === roleIndex ? { ...r, notes: nextNotes } : r));
        return { ...c, roles };
      }),
    );

    enqueueWrite("appendRoleNote", () => supabase.from("roles").update({ notes: nextNotes }).eq("id", role.id));
  }

  return {
    companies,
    loading,
    activeCompany,
    activeRole,
    activeRoleIndex,
    selectCompany,
    selectRole,
    togglePriority,
    updateRoleField,
    addCompany,
    deleteCompany,
    appendRoleNote,
  };
}
