// Scheduled sync: pulls new-grad postings into `job_postings` and internships
// into `internship_postings`, each from three GitHub-hosted lists and deduped
// across sources by apply-link (url_key, a generated column). Run manually via
// `npm run import:job-postings`, or scheduled by .github/workflows/sync-jobs.yml.
// Safe to re-run — every write upserts on the url_key conflict target, and
// postings no longer seen in any source are soft-deleted (is_active = false),
// never hard-deleted.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const CHUNK_SIZE = 500;

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceRoleKey);

interface RawPosting {
  company: string;
  companyUrl: string | null;
  title: string;
  location: string | null;
  url: string;
  category: string | null;
  workModel: string | null;
  salary: string | null;
  requiresUsCitizenship: boolean;
  noSponsorship: boolean;
  isFaang: boolean;
  advancedDegreeRequired: boolean;
  isClosed: boolean;
  datePosted: string | null; // ISO yyyy-mm-dd
  source: "jobright" | "speedyapply" | "simplify";
}

interface Feed {
  table: "job_postings" | "internship_postings";
  jobrightUrl: string;
  speedyapplyUrl: string;
  simplifyUrl: string;
  keepListing?: (listing: SimplifyListing) => boolean;
  categoryAliases?: Record<string, string>;
}

const FEEDS: Feed[] = [
  {
    table: "job_postings",
    jobrightUrl: "https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md",
    speedyapplyUrl: "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/NEW_GRAD_USA.md",
    simplifyUrl: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
  },
  {
    table: "internship_postings",
    jobrightUrl: "https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-Internship/master/README.md",
    speedyapplyUrl: "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/README.md",
    simplifyUrl: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
    keepListing: (listing) => !allTermsEnded(listing.terms ?? [], new Date()),
    // Simplify has a few listings under older names for the same categories.
    categoryAliases: {
      "Software Engineering": "Software",
      "Data Science, AI & Machine Learning": "AI/ML/Data",
      "Product Management": "Product",
    },
  },
];

// Last day of each term, as [month index, day, years after the term's year].
// "Winter 2026" could mean either end of 2026, so it gets the later reading.
const TERM_ENDS: Record<string, [number, number, number]> = {
  spring: [4, 31, 0],
  summer: [7, 31, 0],
  fall: [11, 31, 0],
  winter: [2, 31, 1],
};

// True only when a listing names at least one term and every named term is
// over. Listings with no parseable term ("N/A", or none) are kept.
function allTermsEnded(terms: string[], now: Date): boolean {
  const ends = terms.flatMap((term) => {
    const match = term.trim().match(/^(spring|summer|fall|winter)\s+(\d{4})$/i);
    if (!match) return [];
    const [month, day, yearOffset] = TERM_ENDS[match[1].toLowerCase()];
    return [new Date(Date.UTC(Number(match[2]) + yearOffset, month, day, 23, 59, 59))];
  });
  return ends.length > 0 && ends.every((end) => end.getTime() < now.getTime());
}

// `failed` is separate from an empty list so a failed fetch can't be mistaken
// for a source that has dropped all of its postings.
interface SourceResult {
  postings: RawPosting[];
  failed: boolean;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// url_key values are full normalized URLs, so a `.in("url_key", batch)` filter
// serializes them into the request's query string, not the body — batching by
// item count alone (like `chunk`) can still produce a URL past reverse-proxy
// length limits. Batch by character budget instead.
function chunkByCharBudget(items: string[], maxChars: number): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;
  for (const item of items) {
    if (current.length > 0 && currentChars + item.length > maxChars) {
      out.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += item.length + 1;
  }
  if (current.length > 0) out.push(current);
  return out;
}

async function fetchWithRetry(target: string, attempts = 3): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(target);
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return null;
}

function normalizeUrlKey(rawUrl: string): string {
  return rawUrl.toLowerCase().replace(/[?#].*$/, "");
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// "Aug 26" (no year) -> this year, unless that lands in the future, in which
// case it must have been posted last year (source has no year field at all).
function parseJobrightDate(text: string): string | null {
  const match = text.trim().match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (!match) return null;
  const now = new Date();
  const candidate = new Date(`${match[1]} ${match[2]}, ${now.getFullYear()}`);
  if (Number.isNaN(candidate.getTime())) return null;
  if (candidate.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    candidate.setFullYear(candidate.getFullYear() - 1);
  }
  return toIsoDate(candidate);
}

// "0d" / "113d" -> today minus N days.
function parseAgeDate(text: string): string | null {
  const match = text.trim().match(/^(\d+)d$/);
  if (!match) return null;
  const days = Number.parseInt(match[1], 10);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIsoDate(d);
}

// Strips a markdown link `[text](url)` or bare `text` down to its display text.
function mdLinkText(cell: string): string {
  const match = cell.match(/\[([^\]]*)\]\([^)]*\)/);
  return (match ? match[1] : cell).replace(/\*\*/g, "").trim();
}

function mdLinkUrl(cell: string): string | null {
  const match = cell.match(/\[[^\]]*\]\(([^)]*)\)/);
  return match ? match[1].trim() : null;
}

// speedyapply's tables use raw HTML anchors (`<a href="url"><strong>text</strong></a>`,
// or an `<img>`-only anchor for the "Posting"/"Apply" column) instead of markdown links.
function htmlAnchorHref(cell: string): string | null {
  const match = cell.match(/<a[^>]*\shref="([^"]*)"/i);
  return match ? match[1].trim() : null;
}

function stripTags(cell: string): string {
  return cell.replace(/<[^>]+>/g, "").trim();
}

function splitMdRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isMdSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c));
}

// The markdown lists write "↳" in the company column to mean "same company as
// the row above". Carry the last real company forward instead of storing the
// arrow as a company name.
interface PreviousCompany {
  company: string;
  companyUrl: string | null;
}

function resolveCompany(company: string, companyUrl: string | null, previous: PreviousCompany): PreviousCompany {
  const isContinuation = company === "" || /^↳/.test(company);
  if (isContinuation && previous.company) return { ...previous };
  previous.company = company;
  previous.companyUrl = companyUrl;
  return { company, companyUrl };
}

// --- jobright-ai lists -----------------------------------------------------

async function fetchJobright(feed: Feed): Promise<SourceResult> {
  console.log(`Fetching jobright-ai list for ${feed.table}...`);
  const res = await fetchWithRetry(feed.jobrightUrl);
  if (!res) {
    console.warn("  jobright fetch failed, skipping source");
    return { postings: [], failed: true };
  }
  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));

  const postings: RawPosting[] = [];
  const previous: PreviousCompany = { company: "", companyUrl: null };
  for (const line of lines) {
    const cells = splitMdRow(line);
    if (cells.length < 5 || isMdSeparatorRow(cells) || cells[0].toLowerCase() === "company") continue;
    const [companyCell, titleCell, location, workModel, dateCell] = cells;
    const jobUrl = mdLinkUrl(titleCell);
    if (!jobUrl) continue;
    const { company, companyUrl } = resolveCompany(mdLinkText(companyCell), mdLinkUrl(companyCell), previous);
    postings.push({
      company,
      companyUrl,
      title: mdLinkText(titleCell),
      location: location || null,
      url: jobUrl,
      category: "Software",
      workModel: workModel || null,
      salary: null,
      requiresUsCitizenship: false,
      noSponsorship: false,
      isFaang: false,
      advancedDegreeRequired: false,
      isClosed: false,
      datePosted: parseJobrightDate(dateCell),
      source: "jobright",
    });
  }
  console.log(`  parsed ${postings.length} jobright postings`);
  return { postings, failed: false };
}

// --- speedyapply/2027-SWE-College-Jobs (NEW_GRAD_USA.md, README.md) --------

async function fetchSpeedyapply(feed: Feed): Promise<SourceResult> {
  console.log(`Fetching speedyapply list for ${feed.table}...`);
  const res = await fetchWithRetry(feed.speedyapplyUrl);
  if (!res) {
    console.warn("  speedyapply fetch failed, skipping source");
    return { postings: [], failed: true };
  }
  const text = await res.text();
  const lines = text.split("\n");

  const postings: RawPosting[] = [];
  const previous: PreviousCompany = { company: "", companyUrl: null };
  let currentSection = "";
  for (const line of lines) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      currentSection = heading[1].trim();
      continue;
    }
    if (!line.trim().startsWith("|")) continue;
    const cells = splitMdRow(line);
    if (cells.length < 4 || isMdSeparatorRow(cells) || stripTags(cells[0]).toLowerCase() === "company") continue;

    // FAANG+ section has an extra Salary column: Company | Position | Location | Salary | Posting | Age
    const hasSalaryCol = cells.length >= 6;
    const companyCell = cells[0];
    const title = cells[1];
    const location = cells[2];
    const salary = hasSalaryCol ? cells[3] : null;
    const ageCell = cells[cells.length - 1];
    const postingCell = cells[cells.length - 2];

    const jobUrl = htmlAnchorHref(postingCell) ?? htmlAnchorHref(companyCell);
    if (!jobUrl) continue;
    const { company, companyUrl } = resolveCompany(stripTags(companyCell), htmlAnchorHref(companyCell), previous);

    postings.push({
      company,
      companyUrl,
      title: stripTags(title),
      location: location || null,
      url: jobUrl,
      category: "Software",
      workModel: null,
      salary: salary || null,
      requiresUsCitizenship: false,
      noSponsorship: false,
      isFaang: /faang/i.test(currentSection),
      advancedDegreeRequired: false,
      isClosed: false,
      datePosted: parseAgeDate(ageCell),
      source: "speedyapply",
    });
  }
  console.log(`  parsed ${postings.length} speedyapply postings`);
  return { postings, failed: false };
}

// --- SimplifyJobs lists (structured listings.json) -------------------------

interface SimplifyListing {
  category: string;
  company_name: string;
  title: string;
  active: boolean;
  date_posted: number; // unix seconds
  url: string;
  locations: string[];
  company_url: string | null;
  sponsorship: string | null;
  degrees: string[];
  terms?: string[];
}

async function fetchSimplify(feed: Feed): Promise<SourceResult> {
  console.log(`Fetching SimplifyJobs listings.json for ${feed.table} (large file)...`);
  const res = await fetchWithRetry(feed.simplifyUrl);
  if (!res) {
    console.warn("  SimplifyJobs fetch failed, skipping source");
    return { postings: [], failed: true };
  }
  // `degrees` lists every degree a posting accepts (e.g. ["Bachelor's",
  // "Master's"]), so it only *requires* an advanced degree when nothing below
  // a Master's is accepted.
  const requiresAdvancedDegree = (degrees: string[]) =>
    degrees.length > 0 && !degrees.some((deg) => /bachelor|associate/i.test(deg));

  const data = (await res.json()) as SimplifyListing[];
  const active = data.filter((d) => d.active && (feed.keepListing?.(d) ?? true));

  const postings: RawPosting[] = active.map((d) => {
    const sponsorship = (d.sponsorship ?? "").toLowerCase();
    return {
      company: d.company_name,
      companyUrl: d.company_url,
      title: d.title,
      location: d.locations?.length ? d.locations.join("; ") : null,
      url: d.url,
      category: (feed.categoryAliases?.[d.category] ?? d.category) || null,
      workModel: null,
      salary: null,
      requiresUsCitizenship: sponsorship.includes("citizen"),
      // Simplify's wording is "Does Not Offer Sponsorship".
      noSponsorship: /does not (offer )?sponsor|no sponsorship/.test(sponsorship),
      isFaang: false,
      advancedDegreeRequired: requiresAdvancedDegree(d.degrees ?? []),
      isClosed: false,
      datePosted: d.date_posted ? toIsoDate(new Date(d.date_posted * 1000)) : null,
      source: "simplify",
    };
  });
  console.log(`  parsed ${postings.length} active SimplifyJobs postings`);
  return { postings, failed: false };
}

// --- merge + upsert --------------------------------------------------------

interface MergedPosting extends RawPosting {
  urlKey: string;
  sources: Set<string>;
}

function mergePostings(all: RawPosting[]): Map<string, MergedPosting> {
  const merged = new Map<string, MergedPosting>();
  for (const p of all) {
    const urlKey = normalizeUrlKey(p.url);
    const existing = merged.get(urlKey);
    if (!existing) {
      merged.set(urlKey, { ...p, urlKey, sources: new Set([p.source]) });
      continue;
    }
    existing.sources.add(p.source);
    // Fill in fields only some sources carry, without clobbering existing data.
    existing.salary ??= p.salary;
    existing.workModel ??= p.workModel;
    existing.category ??= p.category;
    existing.location ??= p.location;
    existing.companyUrl ??= p.companyUrl;
    existing.datePosted ??= p.datePosted;
    existing.isFaang ||= p.isFaang;
    existing.requiresUsCitizenship ||= p.requiresUsCitizenship;
    existing.noSponsorship ||= p.noSponsorship;
    existing.advancedDegreeRequired ||= p.advancedDegreeRequired;
    existing.isClosed ||= p.isClosed;
  }
  return merged;
}

async function fetchAllExisting(table: Feed["table"]): Promise<{ url_key: string; sources: string[]; is_active: boolean }[]> {
  const rows: { url_key: string; sources: string[]; is_active: boolean }[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("url_key, sources, is_active")
      .order("url_key")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    rows.push(...((data ?? []) as { url_key: string; sources: string[]; is_active: boolean }[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function syncFeed(feed: Feed) {
  const results = await Promise.all([fetchJobright(feed), fetchSpeedyapply(feed), fetchSimplify(feed)]);
  const merged = mergePostings(results.flatMap((r) => r.postings));
  console.log(`Merged into ${merged.size} unique postings by link.`);

  const existing = await fetchAllExisting(feed.table);
  const existingByUrlKey = new Map(existing.map((r) => [r.url_key, r]));
  const nowIso = new Date().toISOString();

  const rows = [...merged.values()].map((p) => {
    const priorSources = existingByUrlKey.get(p.urlKey)?.sources ?? [];
    const sources = [...new Set([...priorSources, ...p.sources])];
    return {
      company: p.company,
      company_url: p.companyUrl,
      title: p.title,
      location: p.location,
      url: p.url,
      category: p.category,
      work_model: p.workModel,
      salary: p.salary,
      requires_us_citizenship: p.requiresUsCitizenship,
      no_sponsorship: p.noSponsorship,
      is_faang: p.isFaang,
      advanced_degree_required: p.advancedDegreeRequired,
      is_closed: p.isClosed,
      date_posted: p.datePosted,
      sources,
      last_seen_at: nowIso,
      is_active: true,
      updated_at: nowIso,
    };
  });

  console.log(`Upserting ${feed.table}...`);
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from(feed.table).upsert(batch, { onConflict: "url_key" });
    if (error) throw new Error(`${feed.table} upsert failed: ${error.message}`);
  }

  // A posting missing from this run may only be missing because its source
  // couldn't be fetched, so leave everything active until a complete run.
  const sourceFailed = results.some((r) => r.failed);
  if (sourceFailed) {
    console.warn("A source failed to fetch, skipping the stale pass this run.");
  } else {
    const staleUrlKeys = existing.filter((r) => r.is_active && !merged.has(r.url_key)).map((r) => r.url_key);
    console.log(`Marking ${staleUrlKeys.length} stale postings inactive...`);
    for (const batch of chunkByCharBudget(staleUrlKeys, 4000)) {
      const { error } = await supabase
        .from(feed.table)
        .update({ is_active: false, updated_at: nowIso })
        .in("url_key", batch);
      if (error) throw new Error(`${feed.table} stale-mark failed: ${error.message}`);
    }
  }

  console.log(`Done. Upserted ${rows.length} postings into ${feed.table}.`);
}

// Feeds run independently: one failing doesn't stop the other, but the exit
// code still turns the Action red.
async function main() {
  let anyFailed = false;
  for (const feed of FEEDS) {
    try {
      await syncFeed(feed);
    } catch (err) {
      anyFailed = true;
      console.error(`${feed.table} sync failed:`, err);
    }
  }
  if (anyFailed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
