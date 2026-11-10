// Fills lc_questions.is_premium (LeetCode Premium / paid-only problems) from
// LeetCode's public GraphQL questionList, which reports isPaidOnly for every
// problem. The company-wise CSVs don't carry this, so it's a separate pass.
// Run via `npm run import:premium-flags` after `import:company-questions`
// (new questions start as null = unknown, which the UI treats as free).
// Safe to re-run. The old REST endpoint (/api/problems/all/) is blocked by
// Cloudflare; GraphQL works server-side but caps each page at 100.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const PAGE_SIZE = 100;
const CHUNK_SIZE = 500;

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceRoleKey);

const QUERY = `query q($skip: Int, $limit: Int) {
  questionList(categorySlug: "", limit: $limit, skip: $skip, filters: {}) {
    total: totalNum
    data { titleSlug isPaidOnly }
  }
}`;

async function fetchPage(skip: number): Promise<{ total: number; data: { titleSlug: string; isPaidOnly: boolean }[] }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Referer: "https://leetcode.com", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ query: QUERY, variables: { skip, limit: PAGE_SIZE } }),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { questionList?: { total: number; data: { titleSlug: string; isPaidOnly: boolean }[] } } };
        if (json.data?.questionList) return json.data.questionList;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`LeetCode questionList failed at skip=${skip}`);
}

async function main() {
  console.log("Fetching LeetCode problem list...");
  const paidBySlug = new Map<string, boolean>();
  let total = Infinity;
  for (let skip = 0; skip < total; skip += PAGE_SIZE) {
    const page = await fetchPage(skip);
    total = page.total;
    for (const q of page.data) paidBySlug.set(q.titleSlug, q.isPaidOnly);
    if (page.data.length === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (paidBySlug.size < total * 0.95) {
    throw new Error(`Only got ${paidBySlug.size}/${total} problems from LeetCode; not writing a partial result.`);
  }
  console.log(`LeetCode: ${paidBySlug.size} problems, ${[...paidBySlug.values()].filter(Boolean).length} premium.`);

  const rows: { id: string; slug: string; is_premium: boolean | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("lc_questions").select("id, slug, is_premium").range(from, from + 999);
    if (error) throw new Error(`lc_questions fetch failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const changed = rows
    .filter((r) => paidBySlug.has(r.slug) && paidBySlug.get(r.slug) !== r.is_premium)
    .map((r) => ({ id: r.id, is_premium: paidBySlug.get(r.slug)! }));
  const missing = rows.filter((r) => !paidBySlug.has(r.slug)).length;

  // Group by value so each chunk is one UPDATE ... WHERE id IN (...).
  for (const value of [true, false]) {
    const ids = changed.filter((r) => r.is_premium === value).map((r) => r.id);
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const { error } = await supabase
        .from("lc_questions")
        .update({ is_premium: value })
        .in("id", ids.slice(i, i + CHUNK_SIZE));
      if (error) throw new Error(`lc_questions update failed: ${error.message}`);
    }
  }

  const premium = rows.filter((r) => (paidBySlug.get(r.slug) ?? r.is_premium) === true).length;
  console.log(
    `lc_questions: ${rows.length} rows, ${changed.length} updated, ${premium} premium, ${missing} not found on LeetCode (left as-is).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
