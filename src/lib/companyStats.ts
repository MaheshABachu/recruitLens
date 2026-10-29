import { supabase } from "./supabase";
import type { QuestionDifficulty } from "./companyQuestions";

// Aggregates from the company_stats / trending_questions SQL functions
// (supabase/migrations/20261030120000_company_stats_functions.sql).

export interface CompanyStats {
  name: string;
  total: number;
  // Distinct questions asked in the last 30 days.
  hot: number;
  easy: number;
  medium: number;
  hard: number;
  // Questions the caller has solved, per leetcode_solves (0 when signed out
  // or before a LeetCode sync).
  solved: number;
}

export interface TrendingQuestion {
  title: string;
  slug: string;
  difficulty: QuestionDifficulty | null;
  leetcode_url: string;
  company_count: number;
  // Up to three of the companies that asked it, highest frequency first.
  companies: string[];
}

// Keyed by lowercased name, since lc_companies matching is case-insensitive.
export async function getCompanyStats(names: string[]): Promise<Map<string, CompanyStats>> {
  if (names.length === 0) return new Map();
  const { data, error } = await supabase.rpc("company_stats", { names });
  if (error) {
    console.error("Failed to load company stats:", error);
    return new Map();
  }
  return new Map((data as CompanyStats[]).map((row) => [row.name.toLowerCase(), row]));
}

export async function getTrendingQuestions(maxRows = 10): Promise<TrendingQuestion[]> {
  const { data, error } = await supabase.rpc("trending_questions", { max_rows: maxRows });
  if (error) {
    console.error("Failed to load trending questions:", error);
    return [];
  }
  return data as TrendingQuestion[];
}
