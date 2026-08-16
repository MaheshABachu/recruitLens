import { useState } from "react";
import type { Company, PipelineStatus, Role } from "../types/pipeline";
import {
  initiateGoogleAuth,
  ensureFreshToken,
  clearToken,
  fetchRecruitingEmails,
  fetchEmailContent,
  extractEmailBody,
  extractEmailHeaders,
} from "../lib/gmail";
import { analyzeRecruitingEmailsBatch, type EmailStatusUpdate } from "../lib/emailAgent";
import { getLastSeenSubject, saveLastSeenSubject } from "../lib/emailSyncState";

const TOKEN_KEY = "gmail_access_token";
const LOG_STORAGE_KEY = "email_agent_log";
const LOG_MAX_ENTRIES = 300;

// Gemini returns interview-os's snake_case status vocabulary — map it onto
// RecruitLens's 7-stage PipelineStatus. "technical" has no dedicated stage
// here, so it folds into "Onsite" (the closest forward stage).
const STATUS_MAP: Record<Exclude<EmailStatusUpdate, null>, PipelineStatus> = {
  not_applied: "Not Applied",
  applied: "Applied",
  oa: "OA",
  phone_screen: "Phone Screen",
  technical: "Onsite",
  onsite: "Onsite",
  offer: "Offer",
  rejected: "Rejected",
};

const STATUS_RANK: Record<PipelineStatus, number> = {
  "Not Applied": 0,
  Rejected: 1,
  Applied: 2,
  OA: 3,
  "Phone Screen": 4,
  Onsite: 5,
  Offer: 6,
};

export type SuggestionKind = "new_company" | "status_update" | "note_only";

// The mutation a suggestion would apply if approved — nothing here has
// happened to the pipeline yet.
export interface PendingChange {
  kind: SuggestionKind;
  company_name: string;
  current_status?: PipelineStatus; // status_update only
  proposed_status?: PipelineStatus; // new_company / status_update
  note: string | null;
}

export type ReviewStatus = "none" | "pending" | "approved" | "rejected";

export interface AgentLogEntry {
  id: string;
  gmail_message_id: string;
  subject: string;
  sender: string;
  received_at: string | null;
  processed_at: string;
  company_name: string;
  action_taken: string;
  raw_summary: string;
  company_id?: string;
  review_status: ReviewStatus;
  pending?: PendingChange;
}

export interface SyncResult {
  processed: number;
  suggested: number;
  skipped: number;
}

// The slice of usePipelineStore() the agent needs to read/mutate the pipeline.
export interface EmailAgentStore {
  companies: Company[];
  addCompany: (input: { name: string; status: PipelineStatus }) => Company;
  updateRoleField: <K extends keyof Role>(companyId: string, roleIndex: number, field: K, value: Role[K]) => void;
  appendRoleNote: (companyId: string, roleIndex: number, note: string) => void;
}

function loadLog(): AgentLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveLog(entries: AgentLogEntry[]) {
  localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries.slice(0, LOG_MAX_ENTRIES)));
}

// Picks which role on a multi-role company an email update applies to: the
// role that's furthest along, since that's the one most likely still active.
function pickRoleIndex(company: Company): number {
  let best = 0;
  for (let i = 1; i < company.roles.length; i++) {
    if (STATUS_RANK[company.roles[i].status] > STATUS_RANK[company.roles[best].status]) best = i;
  }
  return best;
}

// Immutable helper for reflecting a store mutation into a locally-held
// companies snapshot — needed because approveAllPending processes several
// suggestions in one synchronous pass, faster than React can re-render
// store.companies between them.
function patchRole(
  companies: Company[],
  companyId: string,
  roleIndex: number,
  patch: (role: Role) => Partial<Role>,
): Company[] {
  return companies.map((c) => {
    if (c.id !== companyId) return c;
    const roles = c.roles.map((r, i) => (i === roleIndex ? { ...r, ...patch(r) } : r));
    return { ...c, roles };
  });
}

function withNote(companies: Company[], companyId: string, roleIndex: number, noteText: string): Company[] {
  return patchRole(companies, companyId, roleIndex, (r) => ({
    notes: r.notes ? `${r.notes}\n${noteText}` : noteText,
  }));
}

// Applies a single suggestion's pending change to the live store and returns
// the log entry rewritten to reflect what actually happened, plus the
// companies snapshot updated to match — callers processing multiple
// suggestions in one pass (approveAllPending) thread this through so each
// suggestion sees what the previous one in the same batch just did, rather
// than a stale pre-batch snapshot. `companies` is never mutated in place.
function applyPendingChange(
  entry: AgentLogEntry,
  store: EmailAgentStore,
  companies: Company[],
): { entry: AgentLogEntry; companies: Company[] } {
  const p = entry.pending;
  if (!p) return { entry, companies };

  const noteText = p.note ? `[${new Date().toLocaleDateString()} via email] ${p.note}` : null;

  if (p.kind === "new_company") {
    // Another suggestion for this same company (a duplicate — recurring
    // invites, multiple emails about the same offer, etc.) may already have
    // created it, either earlier in this batch or in a previous approval.
    // Never create a second company with the same name.
    const existing = companies.find((c) => c.name.toLowerCase() === p.company_name.toLowerCase());
    if (existing) {
      const roleIndex = pickRoleIndex(existing);
      const curStatus = existing.roles[roleIndex].status;
      const advances = !!p.proposed_status && STATUS_RANK[p.proposed_status] > STATUS_RANK[curStatus];

      let nextCompanies = companies;
      let actionTaken: string;
      if (advances && p.proposed_status) {
        store.updateRoleField(existing.id, roleIndex, "status", p.proposed_status);
        nextCompanies = patchRole(nextCompanies, existing.id, roleIndex, () => ({ status: p.proposed_status }));
        actionTaken = `Updated status: ${curStatus} → ${p.proposed_status}`;
      } else {
        actionTaken = `Already in pipeline as ${curStatus}`;
      }
      if (noteText) {
        store.appendRoleNote(existing.id, roleIndex, noteText);
        nextCompanies = withNote(nextCompanies, existing.id, roleIndex, noteText);
      }
      return {
        entry: { ...entry, company_id: existing.id, action_taken: actionTaken, review_status: "approved" },
        companies: nextCompanies,
      };
    }

    const created = store.addCompany({ name: p.company_name, status: p.proposed_status ?? "Applied" });
    let nextCompanies = [...companies, created];
    if (noteText) {
      store.appendRoleNote(created.id, 0, noteText);
      nextCompanies = withNote(nextCompanies, created.id, 0, noteText);
    }
    return {
      entry: {
        ...entry,
        company_id: created.id,
        action_taken: `Added to pipeline as ${p.proposed_status ?? "Applied"}: ${created.name}`,
        review_status: "approved",
      },
      companies: nextCompanies,
    };
  }

  const company = entry.company_id ? companies.find((c) => c.id === entry.company_id) : undefined;
  if (!company) {
    return {
      entry: { ...entry, action_taken: `${entry.action_taken} — company no longer in pipeline`, review_status: "rejected" },
      companies,
    };
  }
  const roleIndex = pickRoleIndex(company);

  if (p.kind === "status_update" && p.proposed_status) {
    store.updateRoleField(company.id, roleIndex, "status", p.proposed_status);
    let nextCompanies = patchRole(companies, company.id, roleIndex, () => ({ status: p.proposed_status }));
    if (noteText) {
      store.appendRoleNote(company.id, roleIndex, noteText);
      nextCompanies = withNote(nextCompanies, company.id, roleIndex, noteText);
    }
    return {
      entry: { ...entry, action_taken: `Updated status: ${p.current_status} → ${p.proposed_status}`, review_status: "approved" },
      companies: nextCompanies,
    };
  }

  // note_only
  let nextCompanies = companies;
  if (noteText) {
    store.appendRoleNote(company.id, roleIndex, noteText);
    nextCompanies = withNote(nextCompanies, company.id, roleIndex, noteText);
  }
  return {
    entry: { ...entry, action_taken: `Added note to ${company.name}`, review_status: "approved" },
    companies: nextCompanies,
  };
}

export function useEmailAgent() {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>(() => loadLog());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  function authenticate() {
    setSyncError(null);
    initiateGoogleAuth((token) => setAccessToken(token)).catch((e: Error) => setSyncError(e.message));
  }

  function disconnect() {
    clearToken();
    localStorage.removeItem(TOKEN_KEY);
    setAccessToken(null);
    setLastSyncResult(null);
  }

  async function syncEmails(store: EmailAgentStore) {
    if (!accessToken) {
      setSyncError("Not authenticated with Gmail.");
      return;
    }
    setSyncing(true);
    setSyncProgress("Connecting to Gmail…");
    setSyncError(null);
    setLastSyncResult(null);

    // Sync no longer mutates the pipeline — this is a read-only snapshot used
    // purely for matching, so it doesn't need to track additions mid-loop.
    const companies = store.companies;

    try {
      const freshToken = await ensureFreshToken();
      setAccessToken(freshToken);

      const messages = await fetchRecruitingEmails(freshToken);

      if (messages.length === 0) {
        setLastSyncResult({ processed: 0, suggested: 0, skipped: 0 });
        setSyncProgress("");
        return;
      }

      // Filter already-processed IDs — dedup log lives in localStorage, not a backend
      const existingLog = loadLog();
      const processedIds = new Set(existingLog.map((l) => l.gmail_message_id));
      let newMsgs = messages.filter((m) => !processedIds.has(m.id));

      setSyncProgress(`Found ${messages.length} recruiting emails · ${newMsgs.length} new to process…`);

      let processed = 0;
      let suggested = 0;
      let skipped = 0;
      const inserted: AgentLogEntry[] = [];

      // Phase 1a: fetch raw email content concurrently — Gmail API calls, not
      // Gemini, so no batching concern here. Capped at FETCH_CONCURRENCY in-flight.
      const FETCH_CONCURRENCY = 10;
      let unauthorized = false;
      let completedFetch = 0;

      interface RawEmail {
        subject: string;
        sender: string;
        date: string;
        body: string;
      }

      const rawEmails: (RawEmail | null)[] = new Array(newMsgs.length);
      let nextFetchIndex = 0;
      async function fetchWorker() {
        while (nextFetchIndex < newMsgs.length) {
          const i = nextFetchIndex++;
          try {
            const full = await fetchEmailContent(freshToken, newMsgs[i].id);
            const { subject, sender, date } = extractEmailHeaders(full);
            rawEmails[i] = { subject, sender, date, body: extractEmailBody(full) };
          } catch (err) {
            if (err instanceof Error && err.message === "GMAIL_UNAUTHORIZED") {
              unauthorized = true;
            } else {
              console.error("Email fetch error:", err);
            }
            rawEmails[i] = null;
          }
          completedFetch++;
          setSyncProgress(`Fetched ${completedFetch} of ${newMsgs.length} emails…`);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(FETCH_CONCURRENCY, newMsgs.length) }, fetchWorker),
      );

      if (unauthorized) {
        clearToken();
        localStorage.removeItem(TOKEN_KEY);
        setAccessToken(null);
        throw new Error("Gmail session expired — please reconnect.");
      }

      // Watermark cutoff: Gmail's search results are newest-first, so stop
      // at the subject we saved after the last sync — everything from there
      // on has already been seen. This sits on top of the message-id dedup
      // above; it just saves Gemini calls on a big backlog by not even
      // analyzing mail past the last known point.
      const lastSeenSubject = await getLastSeenSubject();
      if (lastSeenSubject) {
        const cutoffIndex = rawEmails.findIndex((e) => e?.subject === lastSeenSubject);
        if (cutoffIndex !== -1 && cutoffIndex < newMsgs.length) {
          newMsgs = newMsgs.slice(0, cutoffIndex);
          rawEmails.length = cutoffIndex;
          setSyncProgress(
            `Reached previously-seen subject — ${newMsgs.length} new email${newMsgs.length === 1 ? "" : "s"} to analyze…`,
          );
        }
      }

      // Phase 1b: analyze in batches of BATCH_SIZE — one Gemini call covers
      // BATCH_SIZE emails instead of one call each.
      const BATCH_SIZE = 10;

      interface FetchedEmail {
        subject: string;
        sender: string;
        date: string;
        result: Awaited<ReturnType<typeof analyzeRecruitingEmailsBatch>>[number];
      }

      const fetched: (FetchedEmail | null)[] = new Array(newMsgs.length).fill(null);
      const validIndices = rawEmails
        .map((e, i) => (e ? i : -1))
        .filter((i) => i >= 0);

      for (let start = 0; start < validIndices.length; start += BATCH_SIZE) {
        const batchIndices = validIndices.slice(start, start + BATCH_SIZE);
        const batchInput = batchIndices.map((i) => {
          const raw = rawEmails[i]!;
          return { subject: raw.subject, sender: raw.sender, body: raw.body };
        });
        const results = await analyzeRecruitingEmailsBatch(batchInput, companies);
        batchIndices.forEach((origIndex, j) => {
          const raw = rawEmails[origIndex]!;
          fetched[origIndex] = { subject: raw.subject, sender: raw.sender, date: raw.date, result: results[j] };
        });
        setSyncProgress(
          `Analyzed ${Math.min(start + BATCH_SIZE, validIndices.length)} of ${validIndices.length} emails…`,
        );
      }

      // Phase 2: turn each analysis into a log entry — no pipeline mutation
      // happens here. Actionable results (new company, status advance, or a
      // note) become a "pending" suggestion for the user to approve/reject;
      // everything else is a purely informational skip.
      setSyncProgress("Building suggestions…");

      for (let i = 0; i < newMsgs.length; i++) {
        const entry = fetched[i];
        if (!entry) {
          processed++;
          skipped++;
          continue;
        }
        const { subject, sender, date, result } = entry;

        try {
          processed++;

          const logRow: AgentLogEntry = {
            id: crypto.randomUUID(),
            gmail_message_id: newMsgs[i].id,
            subject: subject || "(no subject)",
            sender,
            received_at: date ? new Date(date).toISOString() : null,
            processed_at: new Date().toISOString(),
            company_name: result?.company_name || "",
            action_taken: "",
            raw_summary: result?.key_info || "",
            review_status: "none",
          };

          if (!result || !result.is_recruiting_email) {
            logRow.action_taken = "Skipped — not a recruiting email";
            skipped++;
          } else {
            const matched = companies.find(
              (c) => c.name.toLowerCase() === (result.company_name ?? "").toLowerCase(),
            );
            const mappedStatus = result.status_update ? STATUS_MAP[result.status_update] : undefined;
            const canCreateNew = !matched && !!result.company_name && result.confidence === "high";

            if (canCreateNew) {
              logRow.pending = {
                kind: "new_company",
                company_name: result.company_name!,
                proposed_status: mappedStatus ?? "Applied",
                note: result.key_info ?? null,
              };
              logRow.action_taken = `Suggested: add "${result.company_name}" to pipeline as ${logRow.pending.proposed_status}`;
              logRow.review_status = "pending";
              suggested++;
            } else if (!matched) {
              logRow.action_taken = result.company_name
                ? `Company not in pipeline: ${result.company_name}`
                : "Could not identify company";
              skipped++;
            } else {
              logRow.company_id = matched.id;
              const roleIndex = pickRoleIndex(matched);
              const curStatus = matched.roles[roleIndex].status;
              const canAdvance =
                result.confidence === "high" && !!mappedStatus && STATUS_RANK[mappedStatus] > STATUS_RANK[curStatus];

              if (canAdvance) {
                logRow.pending = {
                  kind: "status_update",
                  company_name: matched.name,
                  current_status: curStatus,
                  proposed_status: mappedStatus,
                  note: result.key_info ?? null,
                };
                logRow.action_taken = `Suggested: ${matched.name} ${curStatus} → ${mappedStatus}`;
                logRow.review_status = "pending";
                suggested++;
              } else if (result.key_info) {
                logRow.pending = {
                  kind: "note_only",
                  company_name: matched.name,
                  note: result.key_info,
                };
                logRow.action_taken = `Suggested: add note to ${matched.name}`;
                logRow.review_status = "pending";
                suggested++;
              } else if (mappedStatus) {
                logRow.action_taken = `Status not advanced (${mappedStatus} ≤ current ${curStatus})`;
                skipped++;
              } else if (result.confidence === "low") {
                logRow.action_taken = `Low confidence · suggested: ${mappedStatus || "no status"}`;
                skipped++;
              } else {
                logRow.action_taken = "No status change detected";
                skipped++;
              }
            }
          }

          inserted.push(logRow);
        } catch (err) {
          skipped++;
          console.error("Suggestion build error:", err);
        }
      }

      const reversedInserted = [...inserted].reverse();
      const nextLog = [...reversedInserted, ...existingLog];
      saveLog(nextLog);
      setAgentLog(nextLog.slice(0, LOG_MAX_ENTRIES));
      setLastSyncResult({ processed, suggested, skipped });

      // rawEmails is newest-first (same order as newMsgs) — the first
      // non-null entry is the newest subject this sync actually saw.
      const newestSubject = rawEmails.find((e) => e)?.subject;
      if (newestSubject) await saveLastSeenSubject(newestSubject);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
      setSyncProgress("");
    }
  }

  function approveSuggestion(entry: AgentLogEntry, store: EmailAgentStore) {
    const { entry: updated } = applyPendingChange(entry, store, store.companies);
    // Any other pending suggestion for this same company is now moot — the
    // company's outcome has been decided by whichever one just got approved.
    const siblingKey = (entry.company_name || "").toLowerCase();
    const nextLog = loadLog().map((l) => {
      if (l.id === entry.id) return updated;
      if (siblingKey && l.review_status === "pending" && (l.company_name || "").toLowerCase() === siblingKey) {
        return { ...l, review_status: "rejected" as const, action_taken: `${l.action_taken} [auto-dismissed]` };
      }
      return l;
    });
    saveLog(nextLog);
    setAgentLog(nextLog.slice(0, LOG_MAX_ENTRIES));
  }

  function rejectSuggestion(entry: AgentLogEntry) {
    const nextLog = loadLog().map((l) =>
      l.id === entry.id ? { ...l, review_status: "rejected" as const, action_taken: `${l.action_taken} [rejected]` } : l,
    );
    saveLog(nextLog);
    setAgentLog(nextLog.slice(0, LOG_MAX_ENTRIES));
  }

  function approveAllPending(store: EmailAgentStore) {
    let companies = store.companies;
    const nextLog = loadLog().map((l) => {
      if (l.review_status !== "pending") return l;
      const result = applyPendingChange(l, store, companies);
      companies = result.companies;
      return result.entry;
    });
    saveLog(nextLog);
    setAgentLog(nextLog.slice(0, LOG_MAX_ENTRIES));
  }

  function rejectAllPending() {
    const nextLog = loadLog().map((l) =>
      l.review_status === "pending"
        ? { ...l, review_status: "rejected" as const, action_taken: `${l.action_taken} [rejected]` }
        : l,
    );
    saveLog(nextLog);
    setAgentLog(nextLog.slice(0, LOG_MAX_ENTRIES));
  }

  function undoStatusUpdate(logEntry: AgentLogEntry, store: EmailAgentStore) {
    // Parse "Updated status: old → new" — only present once a status_update
    // suggestion has actually been approved.
    const match = logEntry.action_taken.match(/Updated status: (.+) → (.+)/);
    if (!match || !logEntry.company_id) return;
    const [, oldStatus] = match;
    const company = store.companies.find((c) => c.id === logEntry.company_id);
    if (!company) return;
    const roleIndex = pickRoleIndex(company);
    store.updateRoleField(logEntry.company_id, roleIndex, "status", oldStatus as PipelineStatus);
    const nextLog = loadLog().map((l) =>
      l.id === logEntry.id ? { ...l, action_taken: `${l.action_taken} [undone]` } : l,
    );
    saveLog(nextLog);
    setAgentLog(nextLog.slice(0, LOG_MAX_ENTRIES));
  }

  return {
    isAuthenticated: !!accessToken,
    authenticate,
    disconnect,
    syncEmails,
    approveSuggestion,
    rejectSuggestion,
    approveAllPending,
    rejectAllPending,
    undoStatusUpdate,
    agentLog,
    syncing,
    syncProgress,
    lastSyncResult,
    syncError,
    setSyncError,
  };
}
