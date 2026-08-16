import { supabase } from "./supabase";

export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionTimeWindow = "30days" | "90days" | "all_time";

export interface CompanyQuestion {
  problem_name: string;
  problem_slug: string;
  difficulty: QuestionDifficulty | null;
  frequency_score: number;
  time_window: QuestionTimeWindow;
  leetcode_url: string;
}

// Curated per-company LeetCode question data (company_questions table, seeded
// separately — not managed by this app). Matches on company name only, case-
// insensitively and without wildcards, so it's an exact match on name, not a
// fuzzy one — most pipeline companies simply have no rows here, which is
// expected (the table only covers a curated set of companies).
export async function getCompanyQuestions(companyName: string): Promise<CompanyQuestion[]> {
  const { data, error } = await supabase
    .from("company_questions")
    .select("problem_name, problem_slug, difficulty, frequency_score, time_window, leetcode_url")
    .ilike("company_name", companyName);
  if (error) {
    console.error("Failed to load company questions:", error);
    return [];
  }
  return (data ?? []).map((row) => ({ ...row, frequency_score: Number(row.frequency_score) }));
}
