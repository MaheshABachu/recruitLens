import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Per-user sync — leetcode_account/leetcode_solves are now keyed by the
// caller's user_id (see supabase/migrations/20260828220000_add_user_scoping.sql),
// derived from the verified JWT the gateway already checked (verify_jwt: true).
const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function leetcodeGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "LeetCode API error");
  return json.data as T;
}

interface ProfileStats {
  matchedUser: {
    username: string;
    submitStatsGlobal: { acSubmissionNum: { difficulty: string; count: number }[] };
  } | null;
}

interface RecentSubmissions {
  recentAcSubmissionList: { id: string; titleSlug: string; timestamp: string }[];
}

interface QuestionDifficulty {
  question: { difficulty: string } | null;
}

async function fetchProfileStats(username: string) {
  const data = await leetcodeGraphQL<ProfileStats>(
    `query userProblemsSolved($username: String!) {
      matchedUser(username: $username) {
        username
        submitStatsGlobal { acSubmissionNum { difficulty count } }
      }
    }`,
    { username },
  );
  if (!data.matchedUser) throw new Error(`No LeetCode user found for "${username}"`);
  const counts = Object.fromEntries(
    data.matchedUser.submitStatsGlobal.acSubmissionNum.map((c) => [c.difficulty, c.count]),
  );
  return {
    solved: counts["All"] ?? 0,
    easy: counts["Easy"] ?? 0,
    medium: counts["Medium"] ?? 0,
    hard: counts["Hard"] ?? 0,
  };
}

async function fetchRecentSubmissions(username: string) {
  // LeetCode hard-caps this list at 20 regardless of the requested limit —
  // there is no paging past that via this query. A resync only ever picks
  // up whatever's newest within the last 20 accepted submissions; solves
  // accumulate across repeated syncs, they aren't backfilled in one shot.
  const data = await leetcodeGraphQL<RecentSubmissions>(
    `query recentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) { id titleSlug timestamp }
    }`,
    { username, limit: 20 },
  );
  return data.recentAcSubmissionList;
}

async function fetchDifficulty(titleSlug: string): Promise<string | null> {
  const data = await leetcodeGraphQL<QuestionDifficulty>(
    `query questionDifficulty($titleSlug: String!) { question(titleSlug: $titleSlug) { difficulty } }`,
    { titleSlug },
  );
  return data.question?.difficulty ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }
  const userId = authData.user.id;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let username: string | undefined = body.username;

    if (!username) {
      const { data: account } = await supabase
        .from("leetcode_account")
        .select("username")
        .eq("user_id", userId)
        .maybeSingle();
      username = account?.username ?? undefined;
    }
    if (!username) return jsonResponse({ error: "No LeetCode username connected yet" }, 400);

    await supabase
      .from("leetcode_account")
      .upsert(
        { user_id: userId, username, sync_status: "syncing", last_error: null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    const [stats, submissions] = await Promise.all([
      fetchProfileStats(username),
      fetchRecentSubmissions(username),
    ]);

    // Resolve difficulty only for slugs we haven't stored yet — bounds the
    // number of extra GraphQL calls to genuinely new problems per sync.
    const { data: knownProblems } = await supabase
      .from("leetcode_problems")
      .select("id, slug")
      .in("slug", submissions.map((s) => s.titleSlug));
    const knownBySlug = new Map((knownProblems ?? []).map((p) => [p.slug, p.id] as const));

    for (const sub of submissions) {
      let problemId = knownBySlug.get(sub.titleSlug);
      if (!problemId) {
        const difficulty = await fetchDifficulty(sub.titleSlug);
        const { data: inserted, error } = await supabase
          .from("leetcode_problems")
          .upsert({ slug: sub.titleSlug, title: sub.titleSlug, difficulty }, { onConflict: "slug" })
          .select("id")
          .single();
        if (error || !inserted) throw new Error(error?.message ?? "Failed to upsert problem");
        problemId = inserted.id;
        knownBySlug.set(sub.titleSlug, problemId);
      }

      const solvedAt = new Date(Number(sub.timestamp) * 1000).toISOString();
      await supabase
        .from("leetcode_solves")
        .upsert(
          { user_id: userId, problem_id: problemId, submission_id: sub.id, solved_at: solvedAt },
          { onConflict: "user_id,problem_id" },
        );
    }

    const { data: updated } = await supabase
      .from("leetcode_account")
      .update({
        sync_status: "idle",
        last_synced_at: new Date().toISOString(),
        last_error: null,
        solved_count: stats.solved,
        easy_count: stats.easy,
        medium_count: stats.medium,
        hard_count: stats.hard,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .select()
      .single();

    return jsonResponse({ account: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await supabase
      .from("leetcode_account")
      .update({ sync_status: "error", last_error: message, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return jsonResponse({ error: message }, 500);
  }
});
