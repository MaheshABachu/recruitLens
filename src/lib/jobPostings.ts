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

const PAGE_SIZE = 1000;

// PostgREST caps each response at PAGE_SIZE rows — this pages through active
// postings with .range() until a short page signals the end, same pattern as
// src/lib/companyQuestions.ts's fetchAllCompanyQuestionRows. The secondary
// .order("id") is required, not cosmetic: date_posted has many ties (nulls,
// same-day postings), and without a unique tiebreaker Postgres is free to
// return ties in a different order per page request, causing rows to be
// skipped or duplicated across the .range() window boundaries.
async function fetchAllActivePostingRows(): Promise<RawJobPostingRow[]> {
  const rows: RawJobPostingRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("job_postings")
      .select(
        "id, company, company_url, title, location, url, category, work_model, salary, requires_us_citizenship, no_sponsorship, is_faang, advanced_degree_required, is_closed, date_posted, sources",
      )
      .eq("is_active", true)
      .order("date_posted", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<RawJobPostingRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function getJobPostings(): Promise<JobPosting[]> {
  let rows: RawJobPostingRow[];
  try {
    rows = await fetchAllActivePostingRows();
  } catch (error) {
    console.error("Failed to load job postings:", error);
    return [];
  }

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
