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
import { analyzeRecruitingEmail, type EmailStatusUpdate } from "../lib/emailAgent";

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
}

export interface SyncResult {
  processed: number;
  updated: number;
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

// Plain, deterministic recap of what this sync changed — no Gemini call.
function buildSyncSummary(entries: AgentLogEntry[]): string {
  const updates = entries.filter(
    (e) => e.action_taken.startsWith("Updated status:") || e.action_taken.startsWith("Added to pipeline"),
  );
  if (updates.length === 0) return "No companies were updated this sync.";
  const lines = updates.map((e) => `${e.company_name || "Unknown company"} — ${e.action_taken}`);
  return `Updated ${updates.length} ${updates.length === 1 ? "company" : "companies"}:\n${lines.join("\n")}`;
}

export function useEmailAgent() {
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>(() => loadLog());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

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
    setSyncSummary(null);

    let companies = store.companies;

    try {
      const freshToken = await ensureFreshToken();
      setAccessToken(freshToken);

      const messages = await fetchRecruitingEmails(freshToken);

      if (messages.length === 0) {
        setLastSyncResult({ processed: 0, updated: 0, skipped: 0 });
        setSyncSummary("No recruiting-related emails found in the last 30 days.");
        setSyncProgress("");
        return;
      }

      // Filter already-processed IDs — dedup log lives in localStorage, not a backend
      const existingLog = loadLog();
      const processedIds = new Set(existingLog.map((l) => l.gmail_message_id));
      const newMsgs = messages.filter((m) => !processedIds.has(m.id));

      setSyncProgress(`Found ${messages.length} recruiting emails · ${newMsgs.length} new to process…`);

      let processed = 0;
      let updated = 0;
      let skipped = 0;
      const inserted: AgentLogEntry[] = [];

      // Phase 1: fetch + analyze concurrently — this is the slow, network-bound
      // part (Gmail fetch + Gemini call per email), so it's the one worth
      // parallelizing. Capped at CONCURRENCY in-flight requests at a time.
      const CONCURRENCY = 6;
      let completedAnalysis = 0;
      let unauthorized = false;

      interface FetchedEmail {
        subject: string;
        sender: string;
        date: string;
        result: Awaited<ReturnType<typeof analyzeRecruitingEmail>>;
      }

      async function fetchAndAnalyze(msgId: string): Promise<FetchedEmail | null> {
        try {
          const full = await fetchEmailContent(freshToken, msgId);
          const { subject, sender, date } = extractEmailHeaders(full);
          const body = extractEmailBody(full);
          const result = await analyzeRecruitingEmail(subject, sender, body, companies);
          completedAnalysis++;
          setSyncProgress(`Analyzed ${completedAnalysis} of ${newMsgs.length} emails…`);
          return { subject, sender, date, result };
        } catch (err) {
          if (err instanceof Error && err.message === "GMAIL_UNAUTHORIZED") {
            unauthorized = true;
            return null;
          }
          completedAnalysis++;
          console.error("Email processing error:", err);
          return null;
        }
      }

      const fetched: (FetchedEmail | null)[] = new Array(newMsgs.length);
      let nextIndex = 0;
      async function worker() {
        while (nextIndex < newMsgs.length) {
          const i = nextIndex++;
          fetched[i] = await fetchAndAnalyze(newMsgs[i].id);
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, newMsgs.length) }, worker));

      if (unauthorized) {
        clearToken();
        localStorage.removeItem(TOKEN_KEY);
        setAccessToken(null);
        throw new Error("Gmail session expired — please reconnect.");
      }

      // Phase 2: apply pipeline mutations sequentially, in original message
      // order — dedup/match logic needs to see companies added by earlier
      // emails in this same sync, so this part stays serial (it's fast: no
      // network calls, just local state updates).
      setSyncProgress("Updating pipeline…");

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
          };

          if (!result || !result.is_recruiting_email) {
            logRow.action_taken = "Skipped — not a recruiting email";
            skipped++;
          } else {
            let matched = companies.find(
              (c) => c.name.toLowerCase() === (result.company_name ?? "").toLowerCase(),
            );
            let justAdded = false;
            const mappedStatus = result.status_update ? STATUS_MAP[result.status_update] : undefined;

            if (!matched && result.company_name && result.confidence === "high") {
              matched = store.addCompany({ name: result.company_name, status: mappedStatus ?? "Applied" });
              companies = [...companies, matched];
              justAdded = true;
            }

            if (matched) logRow.company_id = matched.id;

            if (matched && result.confidence === "high" && mappedStatus) {
              const roleIndex = pickRoleIndex(matched);
              if (justAdded) {
                logRow.action_taken = `Added to pipeline as ${mappedStatus}: ${matched.name}`;
                updated++;
              } else {
                const curStatus = matched.roles[roleIndex].status;
                if (STATUS_RANK[mappedStatus] > STATUS_RANK[curStatus]) {
                  store.updateRoleField(matched.id, roleIndex, "status", mappedStatus);
                  logRow.action_taken = `Updated status: ${curStatus} → ${mappedStatus}`;
                  updated++;
                } else {
                  logRow.action_taken = `Status not advanced (${mappedStatus} ≤ current ${curStatus})`;
                  skipped++;
                }
              }
            } else if (justAdded) {
              logRow.action_taken = `Added to pipeline: ${matched!.name}`;
              updated++;
            } else if (!matched) {
              logRow.action_taken = result.company_name
                ? `Company not in pipeline: ${result.company_name}`
                : "Could not identify company";
              skipped++;
            } else if (result.confidence === "low") {
              logRow.action_taken = `Low confidence · suggested: ${mappedStatus || "no status"}`;
              skipped++;
            } else {
              logRow.action_taken = "No status change detected";
              skipped++;
            }

            // Always append key_info as a timestamped note on the matched role
            if (result.key_info && matched) {
              const roleIndex = pickRoleIndex(matched);
              const note = `[${new Date().toLocaleDateString()} via email] ${result.key_info}`;
              store.appendRoleNote(matched.id, roleIndex, note);
            }
          }

          inserted.push(logRow);
        } catch (err) {
          skipped++;
          console.error("Pipeline update error:", err);
        }
      }

      const reversedInserted = [...inserted].reverse();
      const nextLog = [...reversedInserted, ...existingLog];
      saveLog(nextLog);
      setAgentLog(nextLog.slice(0, LOG_MAX_ENTRIES));
      setLastSyncResult({ processed, updated, skipped });
      setSyncSummary(buildSyncSummary(inserted));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
      setSyncProgress("");
    }
  }

  function undoStatusUpdate(logEntry: AgentLogEntry, store: EmailAgentStore) {
    // Parse "Updated status: old → new"
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
    undoStatusUpdate,
    agentLog,
    syncing,
    syncProgress,
    lastSyncResult,
    syncError,
    setSyncError,
    syncSummary,
  };
}
