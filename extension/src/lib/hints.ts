import type { Hint, HintBundle, Struggle } from "./types";

const LEETCODE_GRAPHQL = "https://leetcode.com/graphql";
const CACHE_PREFIX = "lcq:";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export async function leetcodeGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(LEETCODE_GRAPHQL, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`LeetCode returned ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "LeetCode API error");
  return json.data as T;
}

interface LcQuestion {
  title: string;
  hints: string[];
  topics: string[];
}

export async function fetchLeetCodeQuestion(slug: string): Promise<LcQuestion | null> {
  const key = CACHE_PREFIX + slug;
  const cached = (await chrome.storage.local.get(key))[key] as { at: number; q: LcQuestion | null } | undefined;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.q;

  const data = await leetcodeGraphQL<{
    question: { title: string; hints: string[]; topicTags: { name: string }[] } | null;
  }>(
    `query focusHints($titleSlug: String!) {
      question(titleSlug: $titleSlug) { title hints topicTags { name } }
    }`,
    { titleSlug: slug },
  );
  const q = data.question
    ? { title: data.question.title, hints: data.question.hints ?? [], topics: data.question.topicTags.map((t) => t.name) }
    : null;
  await chrome.storage.local.set({ [key]: { at: Date.now(), q } });
  return q;
}

// Not hints about the problem — general nudges for where the user said they're
// stuck, shown above the official hints.
const TIPS: Record<Struggle, string> = {
  understanding:
    "Work Example 1 by hand, slowly. Restate the task in one sentence. Then read the constraints: n tells you the target complexity (n ≤ 10⁵ usually means O(n log n) or better).",
  approach:
    "Write the brute force first, even if it's too slow. Then ask what work it repeats - that's usually what a hash map, two pointers, sorting or a heap removes.",
  efficiency:
    "Find the line inside your innermost loop. Can a precomputed structure (hash map, prefix sums, sorted order, heap) answer it in O(1) or O(log n) instead?",
  edge_cases:
    "Check: empty input, one element, all equal, duplicates, negatives/zero, already sorted, the largest n, and integer overflow.",
  debugging:
    "Run the failing input by hand next to your code, one line at a time. Print state at loop boundaries. Off-by-one and not resetting state between iterations are the usual suspects.",
};

/**
 * Official hints, ordered for where the user is stuck. NeetCode's own hints
 * (scraped from the page) win over LeetCode's when the page has them.
 */
export async function buildHints(
  leetcodeSlug: string | null,
  struggle: Struggle,
  pageHints: Hint[],
): Promise<HintBundle> {
  let lc: LcQuestion | null = null;
  if (leetcodeSlug) {
    try {
      lc = await fetchLeetCodeQuestion(leetcodeSlug);
    } catch (e) {
      console.warn("Vantage Focus: couldn't load LeetCode hints", e);
    }
  }

  let hints: Hint[];
  let source: HintBundle["source"];
  if (pageHints.length) {
    hints = pageHints;
    source = "neetcode";
  } else if (lc?.hints.length) {
    hints = lc.hints.map((html) => ({ kind: "hint" as const, html }));
    source = "leetcode";
  } else {
    hints = [];
    source = "none";
  }

  // "Making it efficient" leads with the complexity target when we have one;
  // otherwise it goes last, since it gives away the shape of the answer.
  const complexity = hints.filter((h) => h.kind === "complexity");
  const plain = hints.filter((h) => h.kind === "hint");
  const ordered = struggle === "efficiency" ? [...complexity, ...plain] : [...plain, ...complexity];

  return { hints: ordered, topics: lc?.topics ?? [], source, tip: TIPS[struggle] };
}
