# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite, HMR)
npm run build     # tsc -b && vite build → dist/
npm run preview   # serve the dist/ build locally
npm run lint      # eslint . — NOT currently runnable: eslint isn't in devDependencies
```

No test suite exists.

## Environment Variables

Required in `.env.local` (gitignored):

```
VITE_GEMINI_API_KEY=
VITE_GOOGLE_CLIENT_ID=   # Gmail OAuth (GIS popup) — sync agent is disabled without it
VITE_SUPABASE_URL=       # https://sytbbdmrkzfrpqtmioiv.supabase.co — the "recruitLens" project
VITE_SUPABASE_ANON_KEY=  # anon (legacy JWT) key — RLS policies are permissive, see below
SUPABASE_SERVICE_ROLE_KEY=  # service role key — never VITE_-prefixed, must not reach the client bundle. Only used by the one-off/scheduled import scripts (scripts/import-company-questions.ts, scripts/import-job-postings.ts), which bypass RLS to write. Also required as a GitHub Actions secret (alongside VITE_SUPABASE_URL) for .github/workflows/sync-jobs.yml.
```

## Supabase

Project `recruitLens` (`sytbbdmrkzfrpqtmioiv`), same org as the sibling `interview-os` project. Tables:
- `companies` / `roles` (child, `company_id` FK, `on delete cascade`) — column names mirror `src/types/pipeline.ts`'s `Company`/`Role` shapes except `group` → `category` (`group` is a reserved word) and camelCase → snake_case (`nextAction` → `next_action`, etc.). `status` is a free-text column with a `CHECK` constraint against the 7 `PipelineStatus` values — no enum, no translation layer, matching how the app already treats status as the display string directly.
- `email_sync_state` — single row (`id = 1`, always upsert, same "exactly one row" convention as interview-os's `interview_profile`/`leetcode_sync`), holds `last_subject`: the watermark the email agent uses to know where the previous sync left off. See `emailAgentArchitecture.md`.
- `leetcode_account` — same singleton-row convention (`id = 1`) as `email_sync_state`. `leetcodePlan.md`'s original schema had a `user_id` FK; dropped in favor of the singleton row since this app has no auth (see below) — there's only ever one account. Holds `username`, `sync_status` (`'idle' | 'syncing' | 'error'`), `last_synced_at`, `last_error`, and the solved-count stats (`solved_count`/`easy_count`/`medium_count`/`hard_count`).
- `leetcode_problems` / `leetcode_solves` (child, `problem_id` FK, `on delete cascade`, `unique (problem_id)` since it's one account) — populated by the `leetcode-sync` Edge Function from LeetCode's public GraphQL API. That API hard-caps `recentAcSubmissionList` at 20 entries regardless of the requested limit, so a sync only ever sees the most recent 20 accepted submissions — `leetcode_solves` accumulates across repeated syncs, it isn't backfilled in one shot. `pg_cron` daily resync is deferred (see `leetcodeSyncTodo.md`); for now `leetcode-sync` only runs on manual Connect/Resync from the settings panel.
- `lc_companies` / `lc_questions` / `lc_topics` / `lc_question_topics` / `lc_company_questions` — normalized `[company] -> [time window] -> [question]` schema (`lc_` prefix so it's unmistakably distinct from the pipeline's own `companies`/`roles`), sourced from `github.com/liquidslr/leetcode-company-wise-problems` (~470 companies) and imported via `scripts/import-company-questions.ts` (`npm run import:company-questions`, one-off/rerunnable, needs a `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` — never `VITE_`-prefixed, must not reach the client bundle). `lc_questions` is deduped by LeetCode slug; `lc_company_questions` is the fact table (`company_id`, `question_id`, `time_window` one of `'30days' | '3months' | '6months' | '6months_plus' | 'all_time'`, `frequency_score`, `acceptance_rate`), one row per `(company, question, time_window)`. `lc_topics`/`lc_question_topics` hold each question's LeetCode topic tags (e.g. "Array", "Hash Table") as a real many-to-many relation, not a flattened string. Not managed by this app at runtime — imported separately, read-only from the frontend. `src/lib/companyQuestions.ts` matches `lc_companies.name` to a pipeline company by exact (case-insensitive) name, same as before — no real FK between the two, since coverage differs (most pipeline companies have no rows here). Rendered as the "Company questions" section in `CompanyDetail` (`src/components/pipeline/CompanyQuestions.tsx`), under Application materials, only when a match exists. Schema DDL lives in `supabase/migrations/` (also applied directly via the Supabase MCP `apply_migration` tool — no local Supabase CLI project in this repo).
- `job_postings` — new-grad postings synced daily from three GitHub-hosted lists (`jobright-ai/2026-Software-Engineer-New-Grad`'s README table, `speedyapply/2027-SWE-College-Jobs`'s `NEW_GRAD_USA.md` tables, `SimplifyJobs/New-Grad-Positions`'s structured `.github/scripts/listings.json`) via `scripts/import-job-postings.ts` (`npm run import:job-postings`, same service-role-key convention as the LeetCode import). Dedup key is `url_key`, a generated column normalizing the apply `url` (lowercased, query/fragment stripped) — the same posting appearing in 2+ source lists collapses into one row, with `sources` (a `text[]`) recording which lists cited it, rather than "filtering out" the duplicate by dropping it. Rows are soft-deleted (`is_active = false`) when a sync no longer sees them in any source, never hard-deleted, matching the `leetcode_*`/`lc_*` convention. Scheduled daily at noon ET via `.github/workflows/sync-jobs.yml` (this repo's only GitHub Actions workflow — needs `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set as repo secrets); also runnable manually. Read in the frontend via `src/lib/jobPostings.ts` → `useJobPostings` → the `Jobs` tab's `JobsBoard` component — browse/filter only, no write path back into `usePipelineStore`.

**Auth is a login gate, not multi-tenancy.** `AuthContext` (`src/context/AuthContext.tsx`, consumed via `useAuth()`) wraps Supabase Auth's Google OAuth (`supabase.auth.signInWithOAuth({ provider: "google" })`) purely to keep the app off the open internet while gathering early feedback — `App.tsx` renders `LoginScreen` until a session exists. Requires the Google provider to be enabled in the Supabase dashboard (Authentication → Providers → Google, with a Google Cloud OAuth client whose authorized redirect URI is `https://sytbbdmrkzfrpqtmioiv.supabase.co/auth/v1/callback`) — that's a manual dashboard step, not something in this repo. RLS is still `using (true) with check (true)` on every table for `anon`/`authenticated` — every signed-in user reads/writes the same shared data, there is no per-user isolation. This was a deliberate scope call (see the conversation that added it) over full multi-tenancy (`user_id` columns + scoped RLS + reworking the `leetcode_account`/`email_sync_state` singleton rows) — don't silently upgrade to that without discussing it, it's a much bigger schema change.

**Edge Function:** `leetcode-sync` (deployed via Supabase, not part of this repo's build — see the project's Edge Functions in the Supabase dashboard) calls LeetCode's public GraphQL endpoint server-side (the browser can't call it directly — LeetCode's CORS headers only allow `leetcode.com` as an origin) and writes to `leetcode_account`/`leetcode_problems`/`leetcode_solves` using the service role key. Invoked from the frontend via `supabase.functions.invoke("leetcode-sync", { body })` in `src/lib/leetcode.ts` — an empty body resyncs the already-connected username, `{ username }` connects a new one.

## Architecture

React 18 + TypeScript + Vite. Styling is hand-written CSS custom properties (`src/styles/tokens.css` + `global.css`) — no Tailwind, no CSS framework. No React Router — the tab bar is local state in `App.tsx`. No global state library.

**Build scope is intentionally partial.** `plan.md` is the authoritative spec for what's in/out of scope — read it before touching layout or state shape. `App.tsx`'s `Tab` union is currently just `"Pipeline" | "Jobs"`, both functional — there are no disabled stub tabs at the moment. If a new tab is added to the union before it has a real view behind it, follow the same rule that applied to the old Practice/AI Coach/Resume stubs: render it disabled with a "Soon" badge, don't build a placeholder page for it.

**State is two mechanisms, deliberately not more (plus `AuthContext` for the login gate above):**
- `ThemeContext` (`src/context/ThemeContext.tsx`) — the only real cross-cutting global (light/dark, persisted to `localStorage` under `vantage-theme`).
- `usePipelineStore()` (`src/hooks/usePipelineStore.ts`) — a plain hook, not a Context, holding `companies`/`activeCompany`/`activeRole` in `useState`, hydrated once from Supabase on mount. Every mutation is **optimistic**: local state updates immediately, the matching Supabase write fires in the background (not awaited) — `addCompany` generates its own `id`/role `id` client-side via `crypto.randomUUID()` specifically so it can stay synchronous and return the new `Company` immediately, same as before persistence existed. It's called once in `App.tsx` and prop-drilled two levels to `Sidebar` and `CompanyDetail`. Presentational components (`PipelineTracker`, `FieldGrid`, `MaterialsSection`, `StatusBadge`, `Tag`) take data as props and must never import the store hook directly.

`src/types/pipeline.ts` defines `Company`/`Role`/`PipelineStatus`. Status values are the display strings directly (`"Phone Screen"`, `"Not Applied"`, etc.) — matched by the DB's `CHECK` constraint, not translated through an enum.

### Email agent (`src/lib/gmail.ts`, `gemini.ts`, `emailAgent.ts`, `src/hooks/useEmailAgent.ts`)

Ported from a sibling project (interview-os) and adapted to this repo's `PipelineStatus` shape. Read-only Gmail scan + Gemini classification, entirely client-side, no backend. **Full design doc: `emailAgentArchitecture.md`** — read that before changing anything here, it covers the sync flow, the approval queue, and a history of things already tried and reverted (model choices, rate limiting, search breadth).

The short version: `syncEmails` never mutates the pipeline directly — it fetches + batch-analyzes emails via Gemini (`analyzeRecruitingEmailsBatch`, `BATCH_SIZE = 10`, the main lever against free-tier RPM/RPD limits) and turns actionable results into `pending` suggestions in the `email_agent_log` (`localStorage`, also the dedup source). The user reviews and approves/rejects each suggestion (`SuggestionReview.tsx`) before anything touches `usePipelineStore` — `approveSuggestion`/`approveAllPending` in `useEmailAgent.ts` are the only things that ever call `EmailAgentStore`'s mutators.
