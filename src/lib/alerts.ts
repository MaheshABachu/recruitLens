import { FREQUENCY_STATUS, toAlertFrequency, type AlertFrequency } from "./alertFrequency";
import { companyDisplayName, companyKey } from "./faangCompanies";
import { supabase } from "./supabase";

// Email job alerts, phase 1: what each user wants to hear about
// (communicationPlan.md, supabase/migrations/20261111120000_create_alerts.sql).
// RLS scopes every query to the caller and user_id defaults to auth.uid(), so
// nothing here takes a user id except the profiles update.

export const ALERT_CATEGORIES = ["Software", "AI/ML/Data", "Hardware", "Product", "Quant"] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export type { AlertFrequency } from "./alertFrequency";

// Mirrors the migration's alert_preferences_list_sizes check.
export const MAX_LIST_ITEMS = 20;

export interface AlertPreferences {
  wantsJobs: boolean;
  wantsInternships: boolean;
  categories: AlertCategory[];
  titleKeywords: string[];
  locations: string[];
  needsSponsorship: boolean;
  anyFaang: boolean;
  // Never email defense contractors / defense tech (src/lib/defenseCompanies.ts).
  excludeDefense: boolean;
  emailEnabled: boolean;
  frequency: AlertFrequency;
}

export interface AlertCompany {
  nameKey: string;
  displayName: string;
}

export interface AlertSettings {
  // null = the user has never saved preferences.
  preferences: AlertPreferences | null;
  companies: AlertCompany[];
  // Blocked companies: never emailed, whatever else matches.
  excluded: AlertCompany[];
}

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  wantsJobs: false,
  wantsInternships: false,
  categories: [],
  titleKeywords: [],
  locations: [],
  needsSponsorship: false,
  anyFaang: false,
  excludeDefense: false,
  emailEnabled: true,
  frequency: "30m",
};

// Mirrors the alert_preferences_complete check: email needs a kind and a role.
export function canEnableEmail(p: AlertPreferences): boolean {
  return (p.wantsJobs || p.wantsInternships) && p.categories.length > 0;
}

// Account-menu status line. hasAccess = trial or subscription still live
// (matching skips users without app access, so their alerts are paused).
export function alertStatusLabel(p: AlertPreferences | null, hasAccess: boolean): string {
  if (!p || !p.emailEnabled) return "Off";
  if (!hasAccess) return "Paused — trial ended";
  return FREQUENCY_STATUS[p.frequency];
}

// Trim, drop empties and case-insensitive duplicates (first spelling wins), cap the length.
export function cleanChips(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ");
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length === MAX_LIST_ITEMS) break;
  }
  return out;
}

export function toAlertCompany(name: string): AlertCompany {
  return { nameKey: companyKey(name), displayName: companyDisplayName(name) };
}

export interface CompanySuggestion extends AlertCompany {
  postings: number;
}

// Companies with the most open postings for the picked kind(s) and roles
// (alert_company_suggestions RPC), spellings folded by companyKey so TikTok
// and ByteDance count once. Empty on error.
export async function getCompanySuggestions(
  p: Pick<AlertPreferences, "wantsJobs" | "wantsInternships" | "categories">,
  limit: number,
): Promise<CompanySuggestion[]> {
  const { data, error } = await supabase.rpc("alert_company_suggestions", {
    want_jobs: p.wantsJobs,
    want_internships: p.wantsInternships,
    pick_categories: p.categories,
    max_rows: Math.min(limit * 3, 100),
  });
  if (error) {
    console.error("Failed to load company suggestions:", error);
    return [];
  }
  const byKey = new Map<string, CompanySuggestion>();
  for (const row of (data ?? []) as { company: string; postings: number }[]) {
    const company = toAlertCompany(row.company);
    if (!company.nameKey) continue;
    const existing = byKey.get(company.nameKey);
    if (existing) existing.postings += Number(row.postings);
    else byKey.set(company.nameKey, { ...company, postings: Number(row.postings) });
  }
  return [...byKey.values()].sort((a, b) => b.postings - a.postings).slice(0, limit);
}

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

interface PreferencesRow {
  wants_jobs: boolean;
  wants_internships: boolean;
  categories: string[];
  title_keywords: string[];
  locations: string[];
  needs_sponsorship: boolean;
  any_faang: boolean;
  exclude_defense: boolean;
  email_enabled: boolean;
  frequency: string;
}

const PREFERENCE_COLUMNS =
  "wants_jobs, wants_internships, categories, title_keywords, locations, needs_sponsorship, any_faang, exclude_defense, email_enabled, frequency";

function fromRow(r: PreferencesRow): AlertPreferences {
  return {
    wantsJobs: r.wants_jobs,
    wantsInternships: r.wants_internships,
    categories: r.categories as AlertCategory[],
    titleKeywords: r.title_keywords,
    locations: r.locations,
    needsSponsorship: r.needs_sponsorship,
    anyFaang: r.any_faang,
    excludeDefense: r.exclude_defense,
    emailEnabled: r.email_enabled,
    frequency: toAlertFrequency(r.frequency),
  };
}

// What actually gets stored: chips cleaned, and email forced off when the
// row would fail the alert_preferences_complete check.
export function normalizePreferences(p: AlertPreferences): AlertPreferences {
  return {
    ...p,
    titleKeywords: cleanChips(p.titleKeywords),
    locations: cleanChips(p.locations),
    emailEnabled: p.emailEnabled && canEnableEmail(p),
  };
}

function toRow(p: AlertPreferences): PreferencesRow & { timezone: string | null } {
  const n = normalizePreferences(p);
  return {
    wants_jobs: n.wantsJobs,
    wants_internships: n.wantsInternships,
    categories: n.categories,
    title_keywords: n.titleKeywords,
    locations: n.locations,
    needs_sponsorship: n.needsSponsorship,
    any_faang: n.anyFaang,
    exclude_defense: n.excludeDefense,
    email_enabled: n.emailEnabled,
    frequency: n.frequency,
    timezone: browserTimeZone(),
  };
}

// null = couldn't load (callers show an error, not empty defaults that a save would clobber).
export async function getAlertSettings(): Promise<AlertSettings | null> {
  const [prefs, companies, excluded] = await Promise.all([
    supabase.from("alert_preferences").select(PREFERENCE_COLUMNS).maybeSingle<PreferencesRow>(),
    supabase.from("alert_companies").select("name_key, display_name").order("created_at"),
    supabase.from("alert_excluded_companies").select("name_key, display_name").order("created_at"),
  ]);
  const error = prefs.error ?? companies.error ?? excluded.error;
  if (error) {
    console.error("Failed to load alert settings:", error);
    return null;
  }
  const toCompany = (c: { name_key: string; display_name: string }) => ({ nameKey: c.name_key, displayName: c.display_name });
  return {
    preferences: prefs.data ? fromRow(prefs.data) : null,
    companies: (companies.data ?? []).map(toCompany),
    excluded: (excluded.data ?? []).map(toCompany),
  };
}

// Brings one company table in line with `next` (deletes the removed keys,
// inserts the new ones). Returns false on error.
async function syncCompanies(
  table: "alert_companies" | "alert_excluded_companies",
  next: AlertCompany[],
  previous: AlertCompany[],
): Promise<boolean> {
  const nextKeys = new Set(next.map((c) => c.nameKey));
  const prevKeys = new Set(previous.map((c) => c.nameKey));
  const removed = [...prevKeys].filter((k) => !nextKeys.has(k));
  const added = next.filter((c) => !prevKeys.has(c.nameKey));

  if (removed.length > 0) {
    const { error } = await supabase.from(table).delete().in("name_key", removed);
    if (error) {
      console.error(`Failed to remove from ${table}:`, error);
      return false;
    }
  }
  if (added.length > 0) {
    const { error } = await supabase
      .from(table)
      .upsert(
        added.map((c) => ({ name_key: c.nameKey, display_name: c.displayName })),
        { onConflict: "user_id,name_key", ignoreDuplicates: true },
      );
    if (error) {
      console.error(`Failed to add to ${table}:`, error);
      return false;
    }
  }
  return true;
}

// Writes preferences, then the ideal and blocked company lists (the form keeps
// a company in at most one; if it's ever in both, blocking wins at send time).
// Returns an error message or null.
export async function saveAlertSettings(
  preferences: AlertPreferences,
  next: { companies: AlertCompany[]; excluded: AlertCompany[] },
  previous: { companies: AlertCompany[]; excluded: AlertCompany[] },
): Promise<string | null> {
  // user_id is left out so the upsert's DO UPDATE never touches it (clients
  // have no update grant on it); its default fills it in on insert.
  const { error: prefsError } = await supabase
    .from("alert_preferences")
    .upsert(toRow(preferences), { onConflict: "user_id" });
  if (prefsError) {
    console.error("Failed to save alert preferences:", prefsError);
    return "Couldn't save your alert settings. Try again.";
  }

  const ok =
    (await syncCompanies("alert_companies", next.companies, previous.companies)) &&
    (await syncCompanies("alert_excluded_companies", next.excluded, previous.excluded));
  return ok ? null : "Saved your settings, but couldn't update your companies. Try again.";
}

// Intake prompt: true = already shown (finished or skipped), false = not yet,
// null = couldn't tell (callers treat that as "don't show").
export async function getAlertsPrompted(): Promise<boolean | null> {
  const { data, error } = await supabase.from("profiles").select("alerts_prompted_at").maybeSingle();
  if (error) {
    console.error("Failed to load alerts prompt state:", error);
    return null;
  }
  if (!data) return null;
  return data.alerts_prompted_at !== null;
}

export async function markAlertsPrompted(userId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ alerts_prompted_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) console.error("Failed to save alerts prompt state:", error);
}
