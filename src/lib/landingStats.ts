import { supabase } from "./supabase";

export interface LandingStats {
  companies: number | null;
  questions: number | null;
  activeJobs: number | null;
}

// Signed-out visitors can read these: lc_companies / lc_questions /
// job_postings are shared reference data with anon-readable RLS. head: true
// returns only the count header, no rows. Each count fails independently to
// null so the landing page can fall back per-number instead of all-or-nothing.
export async function fetchLandingStats(): Promise<LandingStats> {
  const [companies, questions, activeJobs] = await Promise.all([
    supabase.from("lc_companies").select("*", { count: "exact", head: true }),
    supabase.from("lc_questions").select("*", { count: "exact", head: true }),
    supabase.from("job_postings").select("*", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return {
    companies: companies.error ? null : companies.count,
    questions: questions.error ? null : questions.count,
    activeJobs: activeJobs.error ? null : activeJobs.count,
  };
}
