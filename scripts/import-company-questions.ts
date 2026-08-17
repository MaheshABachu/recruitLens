// One-off bulk backfill: pulls github.com/liquidslr/leetcode-company-wise-problems
// (company -> time-window -> question CSVs) into the lc_companies / lc_questions /
// lc_topics / lc_question_topics / lc_company_questions schema. Run manually via
// `npm run import:company-questions`. Safe to re-run — every write upserts on a
// natural-key conflict target.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
import Papa from "papaparse";

const REPO = "liquidslr/leetcode-company-wise-problems";
const BRANCH = "main";
const CONCURRENCY = 8;
const CHUNK_SIZE = 500;

const FILENAME_TO_WINDOW: Record<string, string> = {
  "1. Thirty Days.csv": "30days",
  "2. Three Months.csv": "3months",
  "3. Six Months.csv": "6months",
  "4. More Than Six Months.csv": "6months_plus",
  "5. All.csv": "all_time",
};

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceRoleKey);

interface QuestionRow {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard" | null;
  leetcode_url: string;
}
interface FactRow {
  companyName: string;
  slug: string;
  time_window: string;
  frequency_score: number;
  acceptance_rate: number | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    active--;
    if (queue.length > 0) queue.shift()!();
  };
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const exec = () => {
        active++;
        fn().then(
          (v) => {
            next();
            resolve(v);
          },
          (e) => {
            next();
            reject(e);
          },
        );
      };
      if (active < concurrency) exec();
      else queue.push(exec);
    });
  };
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return null;
}

function parseSlug(link: string): string | null {
  try {
    const segments = new URL(link).pathname.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("Fetching repo file tree...");
  const treeRes = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`);
  if (!treeRes.ok) throw new Error(`GitHub tree API failed: ${treeRes.status}`);
  const tree = (await treeRes.json()) as { tree: { path: string; type: string }[] };

  const csvPaths = tree.tree
    .filter((e) => e.type === "blob" && e.path.endsWith(".csv"))
    .map((e) => e.path)
    .filter((p) => {
      const filename = p.slice(p.indexOf("/") + 1);
      return filename in FILENAME_TO_WINDOW;
    });
  console.log(`Found ${csvPaths.length} company CSV files.`);

  const questions = new Map<string, QuestionRow>();
  const topics = new Set<string>();
  const questionTopics = new Set<string>(); // "slug|||topic"
  const factRows: FactRow[] = [];
  const failed: string[] = [];

  const limit = pLimit(CONCURRENCY);
  let done = 0;
  await Promise.all(
    csvPaths.map((path) =>
      limit(async () => {
        const slashIdx = path.indexOf("/");
        const companyName = path.slice(0, slashIdx);
        const filename = path.slice(slashIdx + 1);
        const timeWindow = FILENAME_TO_WINDOW[filename];
        const encodedPath = path
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/");
        const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodedPath}`;

        const res = await fetchWithRetry(rawUrl);
        done++;
        if (done % 200 === 0) console.log(`  fetched ${done}/${csvPaths.length}`);
        if (!res) {
          failed.push(path);
          return;
        }
        const text = await res.text();
        const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
        for (const row of parsed.data) {
          const link = row["Link"];
          const title = row["Title"];
          if (!link || !title) continue;
          const slug = parseSlug(link);
          if (!slug) continue;

          const rawDifficulty = (row["Difficulty"] ?? "").trim().toLowerCase();
          const difficulty = rawDifficulty === "easy" || rawDifficulty === "medium" || rawDifficulty === "hard" ? rawDifficulty : null;

          if (!questions.has(slug)) {
            questions.set(slug, { slug, title, difficulty, leetcode_url: link });
          }

          const rowTopics = (row["Topics"] ?? "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          for (const topic of rowTopics) {
            topics.add(topic);
            questionTopics.add(`${slug}|||${topic}`);
          }

          const frequency = Number.parseFloat(row["Frequency"] ?? "");
          const acceptance = Number.parseFloat(row["Acceptance Rate"] ?? "");
          factRows.push({
            companyName,
            slug,
            time_window: timeWindow,
            frequency_score: Number.isFinite(frequency) ? frequency : 0,
            acceptance_rate: Number.isFinite(acceptance) ? acceptance : null,
          });
        }
      }),
    ),
  );

  const companyNames = new Set(csvPaths.map((p) => p.slice(0, p.indexOf("/"))));
  console.log(
    `Parsed: ${companyNames.size} companies, ${questions.size} unique questions, ${topics.size} topics, ${factRows.length} company-question-window rows. ${failed.length} CSVs failed to fetch.`,
  );
  if (failed.length > 0) console.log("Failed paths:", failed.slice(0, 20));

  console.log("Upserting lc_companies...");
  for (const batch of chunk([...companyNames], CHUNK_SIZE)) {
    const { error } = await supabase
      .from("lc_companies")
      .upsert(
        batch.map((name) => ({ name })),
        { onConflict: "name_lower" },
      );
    if (error) throw new Error(`lc_companies upsert failed: ${error.message}`);
  }

  console.log("Upserting lc_questions...");
  const nowIso = new Date().toISOString();
  for (const batch of chunk([...questions.values()], CHUNK_SIZE)) {
    const { error } = await supabase
      .from("lc_questions")
      .upsert(
        batch.map((q) => ({ ...q, updated_at: nowIso })),
        { onConflict: "slug" },
      );
    if (error) throw new Error(`lc_questions upsert failed: ${error.message}`);
  }

  console.log("Upserting lc_topics...");
  for (const batch of chunk([...topics], CHUNK_SIZE)) {
    const { error } = await supabase
      .from("lc_topics")
      .upsert(
        batch.map((name) => ({ name })),
        { onConflict: "name", ignoreDuplicates: true },
      );
    if (error) throw new Error(`lc_topics upsert failed: ${error.message}`);
  }

  console.log("Resolving id maps...");
  async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
    const rows: T[] = [];
    let from = 0;
    const pageSize = 1000;
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`${table} fetch failed: ${error.message}`);
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }

  const companyRows = await fetchAll<{ id: string; name_lower: string }>("lc_companies", "id, name_lower");
  const questionRows = await fetchAll<{ id: string; slug: string }>("lc_questions", "id, slug");
  const topicRows = await fetchAll<{ id: string; name: string }>("lc_topics", "id, name");

  const companyIdByNameLower = new Map(companyRows.map((c) => [c.name_lower, c.id]));
  const questionIdBySlug = new Map(questionRows.map((q) => [q.slug, q.id]));
  const topicIdByName = new Map(topicRows.map((t) => [t.name, t.id]));

  console.log("Upserting lc_question_topics...");
  const joinRows = [...questionTopics]
    .map((pair) => {
      const [slug, topic] = pair.split("|||");
      const question_id = questionIdBySlug.get(slug);
      const topic_id = topicIdByName.get(topic);
      return question_id && topic_id ? { question_id, topic_id } : null;
    })
    .filter((r): r is { question_id: string; topic_id: string } => r !== null);
  for (const batch of chunk(joinRows, CHUNK_SIZE)) {
    const { error } = await supabase
      .from("lc_question_topics")
      .upsert(batch, { onConflict: "question_id,topic_id", ignoreDuplicates: true });
    if (error) throw new Error(`lc_question_topics upsert failed: ${error.message}`);
  }

  console.log("Upserting lc_company_questions...");
  const factUpsertRows = factRows
    .map((r) => {
      const company_id = companyIdByNameLower.get(r.companyName.toLowerCase());
      const question_id = questionIdBySlug.get(r.slug);
      if (!company_id || !question_id) return null;
      return {
        company_id,
        question_id,
        time_window: r.time_window,
        frequency_score: r.frequency_score,
        acceptance_rate: r.acceptance_rate,
        updated_at: nowIso,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  for (const batch of chunk(factUpsertRows, CHUNK_SIZE)) {
    const { error } = await supabase
      .from("lc_company_questions")
      .upsert(batch, { onConflict: "company_id,question_id,time_window" });
    if (error) throw new Error(`lc_company_questions upsert failed: ${error.message}`);
  }

  console.log("Done.");
  console.log(
    `Companies: ${companyRows.length}, Questions: ${questionRows.length}, Topics: ${topicRows.length}, Fact rows written: ${factUpsertRows.length}`,
  );
  if (failed.length > 0) console.log(`${failed.length} CSVs failed to fetch — re-run the script to retry them.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
