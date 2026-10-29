import { supabase } from "./supabase";

// leetcode_account is keyed by user_id (PK) and RLS-scoped to auth.uid(),
// so a plain select with no filter already returns only the caller's row.
export interface LeetCodeAccount {
  username: string | null;
  sync_status: "idle" | "syncing" | "error";
  last_synced_at: string | null;
  last_error: string | null;
  solved_count: number | null;
  easy_count: number | null;
  medium_count: number | null;
  hard_count: number | null;
  latest_submission_id: string | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
}

export async function getLeetCodeAccount(): Promise<LeetCodeAccount | null> {
  const { data, error } = await supabase.from("leetcode_account").select("*").maybeSingle();
  if (error) {
    console.error("Failed to load LeetCode account:", error);
    return null;
  }
  return data;
}

// Fire-and-poll: the leetcode-sync Edge Function does the real work (calls
// LeetCode's GraphQL API, upserts problems/solves, updates this row) and can
// take a few seconds — callers poll getLeetCodeAccount() for sync_status
// rather than awaiting this directly.
export async function triggerLeetCodeSync(username?: string): Promise<void> {
  const { error } = await supabase.functions.invoke("leetcode-sync", {
    body: username ? { username } : {},
  });
  if (error) throw error;
}

// Cheap change probe: the function asks LeetCode for only the newest accepted
// submission and runs the full sync only if its id differs from the stored
// latest_submission_id. Awaited directly (unlike triggerLeetCodeSync) — the
// no-change case is a single GraphQL call and returns the refreshed row.
export async function checkLeetCodeForChanges(): Promise<{ changed: boolean; account: LeetCodeAccount | null }> {
  const { data, error } = await supabase.functions.invoke("leetcode-sync", { body: { mode: "check" } });
  if (error) throw error;
  return { changed: !!data?.changed, account: data?.account ?? null };
}

// Slugs the connected account has an accepted solve for, keyed the same way
// as lc_questions.slug (exposed to callers as CompanyQuestion.problem_slug)
// so callers can do a plain Set lookup.
// Only ever reflects what's made it into leetcode_solves — bounded by the
// same "most recent 20 per sync" limitation as the sync itself.
// RLS-scoped to auth.uid() — no explicit filter needed.
export async function getSolvedProblemSlugs(): Promise<Set<string>> {
  const { data, error } = await supabase.from("leetcode_solves").select("leetcode_problems(slug)");
  if (error) {
    console.error("Failed to load solved problems:", error);
    return new Set();
  }
  const slugs = (data ?? []).map((row) => {
    const problem = row.leetcode_problems as { slug: string } | { slug: string }[] | null;
    return Array.isArray(problem) ? problem[0]?.slug : problem?.slug;
  });
  return new Set(slugs.filter((slug): slug is string => !!slug));
}
