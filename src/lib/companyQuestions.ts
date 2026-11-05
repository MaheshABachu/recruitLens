import { supabase } from "./supabase";
import { prefetch } from "./swrCache";

export type QuestionDifficulty = "easy" | "medium" | "hard";
export type QuestionTimeWindow = "30days" | "3months" | "6months" | "6months_plus" | "all_time";

export interface CompanyQuestion {
  problem_name: string;
  problem_slug: string;
  difficulty: QuestionDifficulty | null;
  frequency_score: number;
  time_window: QuestionTimeWindow;
  leetcode_url: string;
  topics: string[];
}

// Shared by the Companies tab's time-window <select> —
// ordered newest-window-first, matches the descending-recency reading order
// used throughout the Company questions filter.
export const TIME_WINDOWS: { value: QuestionTimeWindow; label: string }[] = [
  { value: "all_time", label: "All time" },
  { value: "6months_plus", label: "6+ months" },
  { value: "6months", label: "6 months" },
  { value: "3months", label: "3 months" },
  { value: "30days", label: "30 days" },
];

// Per-company LeetCode question data, sourced from
// github.com/liquidslr/leetcode-company-wise-problems and imported via
// scripts/import-company-questions.ts — not managed by this app at runtime.
// One RPC call (company_questions, see
// supabase/migrations/20261105120000_company_questions_function.sql) returns
// the whole bank as a jsonb array, matched on company name case-insensitively.
// Throws on failure so the cache keeps its last good copy.
export async function fetchCompanyQuestions(companyName: string): Promise<CompanyQuestion[]> {
  const { data, error } = await supabase.rpc("company_questions", { company_name: companyName });
  if (error) throw error;
  return ((data ?? []) as CompanyQuestion[]).map((q) => ({ ...q, frequency_score: Number(q.frequency_score) }));
}

// The question bank is static reference data (re-imported rarely), so a
// cached copy is good for a day before it's revalidated in the background.
export const COMPANY_QUESTIONS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const companyQuestionsKey = (companyName: string) => `questions:${companyName.toLowerCase()}`;

// Warm a company's questions (hover/focus on a tile) so the click renders
// with no loading flash.
export function prefetchCompanyQuestions(companyName: string) {
  prefetch(companyQuestionsKey(companyName), () => fetchCompanyQuestions(companyName), COMPANY_QUESTIONS_MAX_AGE_MS);
}

// Every company the question bank covers (~470), for the Companies tab's
// lookup. Read straight from lc_companies — the shared/global reference set.
export async function getLcCompanyNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from("lc_companies")
    .select("name")
    .order("name")
    .returns<{ name: string }[]>();
  if (error) {
    console.error("Failed to load company list:", error);
    return [];
  }
  return (data ?? []).map((row) => row.name);
}
