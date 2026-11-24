import type { AlertPreferences } from "./alerts";
import { escapeRegex, locationMatches } from "./alertLocations";
import { isDefenseCompany } from "./defenseCompanies";
import { companyKey } from "./faangCompanies";

// Which postings a user's job alert sends, and in what order. Used by
// scripts/send-job-alerts.ts; pure, so it can be checked without a database.
//
// Companies and locations decide what gets in; roles and keywords decide
// what comes first:
//   - Always required: the posting kind (jobs / internships) the user wants,
//     no known visa blocker when they need sponsorship, and a company that
//     isn't blocked (their blocked list, or defense tech with that switch on).
//   - Gets in: at one of their companies (or FAANG+ with that toggle on), OR
//     in one of their locations, whatever the role.
//   - Users with no companies, no FAANG+ toggle and no locations get every
//     posting in their roles instead (otherwise they'd get everything).
//   - Ranking: title-keyword matches first (the email lists them under their
//     own heading), then postings in their roles, then the rest.

export type AlertPostingKind = "jobs" | "internships";

export interface AlertPosting {
  kind: AlertPostingKind;
  company: string;
  title: string;
  location: string | null;
  category: string | null;
  is_faang: boolean;
  no_sponsorship: boolean;
  requires_us_citizenship: boolean;
}

export interface AlertProfile {
  preferences: AlertPreferences;
  // alert_companies.name_key values (companyKey of each chosen company).
  companyKeys: Set<string>;
  // alert_excluded_companies.name_key values. A key also blocks longer names
  // that start with it ("lockheed martin" blocks "Lockheed Martin Space").
  excludedKeys: Set<string>;
}

export function isExcluded(excludedKeys: Set<string>, key: string): boolean {
  if (!key) return false;
  if (excludedKeys.has(key)) return true;
  for (const k of excludedKeys) if (key.startsWith(`${k} `)) return true;
  return false;
}

export interface AlertMatch {
  // Why it was sent, for the email's per-posting note.
  company: "listed" | "faang" | null;
  location: string | null;
  role: boolean;
  keywords: string[];
  // Higher sorts first.
  score: number;
}

// Keywords match at the start of a word: "ML" doesn't match "HTML", but
// "infra" matches "Infrastructure".
function keywordMatches(title: string, keyword: string) {
  const k = keyword.trim();
  return k !== "" && new RegExp(`(^|[^a-z0-9])${escapeRegex(k)}`, "i").test(title);
}

export function matchPosting(profile: AlertProfile, posting: AlertPosting): AlertMatch | null {
  const p = profile.preferences;

  if (posting.kind === "jobs" ? !p.wantsJobs : !p.wantsInternships) return null;
  if (p.needsSponsorship && (posting.no_sponsorship || posting.requires_us_citizenship)) return null;
  const key = companyKey(posting.company);
  if (isExcluded(profile.excludedKeys, key)) return null;
  if (p.excludeDefense && isDefenseCompany(posting.company)) return null;

  const company = profile.companyKeys.has(key)
    ? "listed"
    : p.anyFaang && posting.is_faang
      ? "faang"
      : null;
  const location = p.locations.find((entry) => locationMatches(posting.location, entry)) ?? null;
  const role = !!posting.category && (p.categories as string[]).includes(posting.category);

  const targeted = profile.companyKeys.size > 0 || p.anyFaang || p.locations.length > 0;
  if (targeted ? !company && !location : !role) return null;

  const keywords = p.titleKeywords.filter((k) => keywordMatches(posting.title, k));
  const score = (keywords.length > 0 ? 8 : 0) + (role ? 4 : 0) + (company && location ? 2 : 0) + (company === "listed" ? 1 : 0);
  return { company, location, role, keywords, score };
}

export function postingMatches(profile: AlertProfile, posting: AlertPosting): boolean {
  return matchPosting(profile, posting) !== null;
}
