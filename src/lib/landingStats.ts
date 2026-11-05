import { supabase } from "./supabase";

export interface LandingStats {
  companies: number | null;
  questions: number | null;
  activeJobs: number | null;
}

// Signed-out visitors can't read the postings tables (they're gated on
// has_app_access(), see supabase/migrations/20261105130000_gate_data_on_access.sql),
// so the counts come from the landing_stats() function, which returns only
// numbers. Any failure falls back to nulls so the page renders fallback copy.
export async function fetchLandingStats(): Promise<LandingStats> {
  const { data, error } = await supabase.rpc("landing_stats");
  if (error || !data) return { companies: null, questions: null, activeJobs: null };
  const num = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    companies: num(data.companies),
    questions: num(data.questions),
    activeJobs: num(data.active_jobs),
  };
}
