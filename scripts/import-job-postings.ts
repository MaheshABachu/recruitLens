// Daily sync: pulls new-grad postings from three GitHub-hosted job lists into
// `job_postings`, deduped across sources by apply-link (url_key, a generated
// column). Run manually via `npm run import:job-postings`, or scheduled by
// .github/workflows/sync-jobs.yml. Safe to re-run — every write upserts on
// the url_key conflict target, and postings no longer seen in any source are
// soft-deleted (is_active = false), never hard-deleted.

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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
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

// --- jobright-ai/2026-Software-Engineer-New-Grad -------------------------

async function fetchJobright(): Promise<RawPosting[]> {
  console.log("Fetching jobright-ai list...");
  const res = await fetchWithRetry(
    "https://raw.githubusercontent.com/jobright-ai/2026-Software-Engineer-New-Grad/master/README.md",
  );
  if (!res) {
    console.warn("  jobright fetch failed, skipping source");
    return [];
  }
  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.trim().startsWith("|"));

  const postings: RawPosting[] = [];
  for (const line of lines) {
    const cells = splitMdRow(line);
    if (cells.length < 5 || isMdSeparatorRow(cells) || cells[0].toLowerCase() === "company") continue;
    const [companyCell, titleCell, location, workModel, dateCell] = cells;
    const jobUrl = mdLinkUrl(titleCell);
    if (!jobUrl) continue;
    postings.push({
      company: mdLinkText(companyCell),
      companyUrl: mdLinkUrl(companyCell),
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
  return postings;
}

// --- speedyapply/2027-SWE-College-Jobs (NEW_GRAD_USA.md) -----------------

async function fetchSpeedyapply(): Promise<RawPosting[]> {
  console.log("Fetching speedyapply list...");
  const res = await fetchWithRetry(
    "https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/NEW_GRAD_USA.md",
  );
  if (!res) {
    console.warn("  speedyapply fetch failed, skipping source");
    return [];
  }
  const text = await res.text();
  const lines = text.split("\n");

  const postings: RawPosting[] = [];
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

    postings.push({
      company: stripTags(companyCell),
      companyUrl: htmlAnchorHref(companyCell),
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
  return postings;
}

// --- SimplifyJobs/New-Grad-Positions (structured listings.json) ----------

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
}

async function fetchSimplify(): Promise<RawPosting[]> {
  console.log("Fetching SimplifyJobs listings.json (large file)...");
  const res = await fetchWithRetry(
    "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
  );
  if (!res) {
    console.warn("  SimplifyJobs fetch failed, skipping source");
    return [];
  }
  const data = (await res.json()) as SimplifyListing[];
  const active = data.filter((d) => d.active);

  const postings: RawPosting[] = active.map((d) => {
    const sponsorship = (d.sponsorship ?? "").toLowerCase();
    return {
      company: d.company_name,
      companyUrl: d.company_url,
      title: d.title,
      location: d.locations?.length ? d.locations.join("; ") : null,
      url: d.url,
      category: d.category || null,
      workModel: null,
      salary: null,
      requiresUsCitizenship: sponsorship.includes("citizen"),
      noSponsorship: sponsorship.includes("does not sponsor") || sponsorship.includes("no sponsorship"),
      isFaang: false,
      advancedDegreeRequired: (d.degrees ?? []).length > 0,
      isClosed: false,
      datePosted: d.date_posted ? toIsoDate(new Date(d.date_posted * 1000)) : null,
      source: "simplify",
    };
  });
  console.log(`  parsed ${postings.length} active SimplifyJobs postings`);
  return postings;
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

async function fetchAllExisting(): Promise<{ url_key: string; sources: string[]; is_active: boolean }[]> {
  const rows: { url_key: string; sources: string[]; is_active: boolean }[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("job_postings")
      .select("url_key, sources, is_active")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`job_postings fetch failed: ${error.message}`);
    rows.push(...((data ?? []) as { url_key: string; sources: string[]; is_active: boolean }[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const [jobright, speedyapply, simplify] = await Promise.all([fetchJobright(), fetchSpeedyapply(), fetchSimplify()]);
  const merged = mergePostings([...jobright, ...speedyapply, ...simplify]);
  console.log(`Merged into ${merged.size} unique postings by link.`);

  const existing = await fetchAllExisting();
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

  console.log("Upserting job_postings...");
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from("job_postings").upsert(batch, { onConflict: "url_key" });
    if (error) throw new Error(`job_postings upsert failed: ${error.message}`);
  }

  const staleUrlKeys = existing.filter((r) => r.is_active && !merged.has(r.url_key)).map((r) => r.url_key);
  console.log(`Marking ${staleUrlKeys.length} stale postings inactive...`);
  for (const batch of chunk(staleUrlKeys, CHUNK_SIZE)) {
    const { error } = await supabase
      .from("job_postings")
      .update({ is_active: false, updated_at: nowIso })
      .in("url_key", batch);
    if (error) throw new Error(`job_postings stale-mark failed: ${error.message}`);
  }

  console.log(`Done. Upserted ${rows.length} postings.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
