import { supabase } from "./supabase";
import type { JobPosting } from "../types/jobPosting";

interface RawJobPostingRow {
  id: string;
  company: string;
  company_url: string | null;
  title: string;
  location: string | null;
  url: string;
  category: string | null;
  work_model: string | null;
  salary: string | null;
  requires_us_citizenship: boolean;
  no_sponsorship: boolean;
  is_faang: boolean;
  advanced_degree_required: boolean;
  is_closed: boolean;
  date_posted: string | null;
  sources: string[];
}

export type PostingKind = "jobs" | "internships";

const TABLE_BY_KIND: Record<PostingKind, string> = {
  jobs: "job_postings",
  internships: "internship_postings",
};

const PAGE_SIZE = 1000;
const COLUMNS =
  "id, company, company_url, title, location, url, category, work_model, salary, requires_us_citizenship, no_sponsorship, is_faang, advanced_degree_required, is_closed, date_posted, sources";

// PostgREST caps each response at PAGE_SIZE rows. The first page also asks for
// the exact count, then the remaining pages load in parallel rather than one
// after another. The secondary .order("id") is required, not cosmetic:
// date_posted has many ties (nulls, same-day postings), and without a unique
// tiebreaker Postgres is free to return ties in a different order per page
// request, causing rows to be skipped or duplicated across page boundaries.
async function fetchAllActivePostingRows(kind: PostingKind): Promise<RawJobPostingRow[]> {
  const page = (from: number, withCount = false) =>
    supabase
      .from(TABLE_BY_KIND[kind])
      .select(COLUMNS, withCount ? { count: "exact" } : undefined)
      .eq("is_active", true)
      .order("date_posted", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<RawJobPostingRow[]>();

  const first = await page(0, true);
  if (first.error) throw first.error;
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;

  const rest = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) rest.push(page(from));
  for (const result of await Promise.all(rest)) {
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
  }
  return rows;
}

// Throws on failure (so the cache keeps its last good copy instead of
// caching an empty list).
export async function getJobPostings(kind: PostingKind): Promise<JobPosting[]> {
  const rows = await fetchAllActivePostingRows(kind);

  return rows.map((r) => ({
    id: r.id,
    company: r.company,
    companyUrl: r.company_url,
    title: r.title,
    location: r.location,
    url: r.url,
    category: r.category,
    workModel: r.work_model,
    salary: r.salary,
    requiresUsCitizenship: r.requires_us_citizenship,
    noSponsorship: r.no_sponsorship,
    isFaang: r.is_faang,
    advancedDegreeRequired: r.advanced_degree_required,
    isClosed: r.is_closed,
    datePosted: r.date_posted,
    sources: r.sources ?? [],
  }));
}
