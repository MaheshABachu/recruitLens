import { supabase } from "./supabase";

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

interface RawCompanyQuestionRow {
  time_window: QuestionTimeWindow;
  frequency_score: number;
  lc_questions: {
    title: string;
    slug: string;
    difficulty: QuestionDifficulty | null;
    leetcode_url: string;
    lc_question_topics: { lc_topics: { name: string } | null }[];
  };
  lc_companies: { name: string };
}

const PAGE_SIZE = 1000;

// PostgREST caps each response at PAGE_SIZE rows — popular companies (e.g.
// Google's "all_time" bucket alone has 2000+ rows) exceed that in a single
// window, so this pages through with .range() until a short page signals the
// end. .order("id") keeps page boundaries stable across requests.
async function fetchAllCompanyQuestionRows(companyName: string): Promise<RawCompanyQuestionRow[]> {
  const rows: RawCompanyQuestionRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("lc_company_questions")
      .select(
        `
        time_window,
        frequency_score,
        lc_questions!inner (
          title, slug, difficulty, leetcode_url,
          lc_question_topics ( lc_topics ( name ) )
        ),
        lc_companies!inner ( name )
      `,
      )
      .ilike("lc_companies.name", companyName)
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<RawCompanyQuestionRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// Per-company LeetCode question data, sourced from
// github.com/liquidslr/leetcode-company-wise-problems and imported via
// scripts/import-company-questions.ts — not managed by this app at runtime.
// Matches on company name only, case-insensitively and without wildcards, so
// it's an exact match on name, not a fuzzy one — most pipeline companies
// simply have no rows here, which is expected (the source only covers a
// curated set of ~470 companies).
export async function getCompanyQuestions(companyName: string): Promise<CompanyQuestion[]> {
  let data: RawCompanyQuestionRow[];
  try {
    data = await fetchAllCompanyQuestionRows(companyName);
  } catch (error) {
    console.error("Failed to load company questions:", error);
    return [];
  }

  return data.map((row) => ({
    problem_name: row.lc_questions.title,
    problem_slug: row.lc_questions.slug,
    difficulty: row.lc_questions.difficulty,
    frequency_score: Number(row.frequency_score),
    time_window: row.time_window,
    leetcode_url: row.lc_questions.leetcode_url,
    topics: row.lc_questions.lc_question_topics.map((qt) => qt.lc_topics?.name).filter((name): name is string => !!name),
  }));
}
