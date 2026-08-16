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
```

## Supabase

Project `recruitLens` (`sytbbdmrkzfrpqtmioiv`), same org as the sibling `interview-os` project. Tables:
- `companies` / `roles` (child, `company_id` FK, `on delete cascade`) — column names mirror `src/types/pipeline.ts`'s `Company`/`Role` shapes except `group` → `category` (`group` is a reserved word) and camelCase → snake_case (`nextAction` → `next_action`, etc.). `status` is a free-text column with a `CHECK` constraint against the 7 `PipelineStatus` values — no enum, no translation layer, matching how the app already treats status as the display string directly.
- `email_sync_state` — single row (`id = 1`, always upsert, same "exactly one row" convention as interview-os's `interview_profile`/`leetcode_sync`), holds `last_subject`: the watermark the email agent uses to know where the previous sync left off. See `emailAgentArchitecture.md`.
- `leetcode_account` — same singleton-row convention (`id = 1`) as `email_sync_state`. `leetcodePlan.md`'s original schema had a `user_id` FK; dropped in favor of the singleton row since this app has no auth (see below) — there's only ever one account. Holds `username`, `sync_status` (`'idle' | 'syncing' | 'error'`), `last_synced_at`, `last_error`, and the solved-count stats (`solved_count`/`easy_count`/`medium_count`/`hard_count`).
- `leetcode_problems` / `leetcode_solves` (child, `problem_id` FK, `on delete cascade`, `unique (problem_id)` since it's one account) — populated by the `leetcode-sync` Edge Function from LeetCode's public GraphQL API. That API hard-caps `recentAcSubmissionList` at 20 entries regardless of the requested limit, so a sync only ever sees the most recent 20 accepted submissions — `leetcode_solves` accumulates across repeated syncs, it isn't backfilled in one shot. `pg_cron` daily resync is deferred (see `leetcodeSyncTodo.md`); for now `leetcode-sync` only runs on manual Connect/Resync from the settings panel.
- `company_questions` (2200+ rows) — a curated, pre-seeded LeetCode-questions-per-company list (`company_name`, `problem_name`, `problem_slug`, `difficulty`, `frequency_score`, `time_window` one of `'30days' | '90days' | 'all_time'`, `leetcode_url`); each problem has one row per `time_window`, not one row with three scores. Not managed by this app — seeded separately, read-only from the frontend. `src/lib/companyQuestions.ts` matches it to a pipeline company by exact (case-insensitive) name; most companies simply have no rows here since the seed only covers a curated set. Rendered as the "Company questions" section in `CompanyDetail` (`src/components/pipeline/CompanyQuestions.tsx`), under Application materials, only when a match exists.

**No auth** (per `plan.md`'s explicit non-goals) — RLS is enabled on every table but with `using (true) with check (true)` policies for `anon`/`authenticated`, so the published anon key has full read/write. This is a deliberate single-user-prototype tradeoff, not an oversight — don't "fix" it by adding user-scoped policies without an actual auth system to back them.

**Edge Function:** `leetcode-sync` (deployed via Supabase, not part of this repo's build — see the project's Edge Functions in the Supabase dashboard) calls LeetCode's public GraphQL endpoint server-side (the browser can't call it directly — LeetCode's CORS headers only allow `leetcode.com` as an origin) and writes to `leetcode_account`/`leetcode_problems`/`leetcode_solves` using the service role key. Invoked from the frontend via `supabase.functions.invoke("leetcode-sync", { body })` in `src/lib/leetcode.ts` — an empty body resyncs the already-connected username, `{ username }` connects a new one.

## Architecture

React 18 + TypeScript + Vite. Styling is hand-written CSS custom properties (`src/styles/tokens.css` + `global.css`) — no Tailwind, no CSS framework. No React Router — the tab bar is local state in `App.tsx`. No global state library.

**Build scope is intentionally partial.** `plan.md` is the authoritative spec for what's in/out of scope — read it before touching layout or state shape. Only the Pipeline tab is functional; Practice/AI Coach/Resume render as disabled "Soon" tabs in `App.tsx` with no click handler and no page behind them. Don't build stub pages for them — a disabled tab is the intended state, not a placeholder to fill in.

**State is two mechanisms, deliberately not more:**
- `ThemeContext` (`src/context/ThemeContext.tsx`) — the only real cross-cutting global (light/dark, persisted to `localStorage` under `recruitlens-theme`).
- `usePipelineStore()` (`src/hooks/usePipelineStore.ts`) — a plain hook, not a Context, holding `companies`/`activeCompany`/`activeRole` in `useState`, hydrated once from Supabase on mount. Every mutation is **optimistic**: local state updates immediately, the matching Supabase write fires in the background (not awaited) — `addCompany` generates its own `id`/role `id` client-side via `crypto.randomUUID()` specifically so it can stay synchronous and return the new `Company` immediately, same as before persistence existed. It's called once in `App.tsx` and prop-drilled two levels to `Sidebar` and `CompanyDetail`. Presentational components (`PipelineTracker`, `FieldGrid`, `MaterialsSection`, `StatusBadge`, `Tag`) take data as props and must never import the store hook directly.

`src/types/pipeline.ts` defines `Company`/`Role`/`PipelineStatus`. Status values are the display strings directly (`"Phone Screen"`, `"Not Applied"`, etc.) — matched by the DB's `CHECK` constraint, not translated through an enum.

### Email agent (`src/lib/gmail.ts`, `gemini.ts`, `emailAgent.ts`, `src/hooks/useEmailAgent.ts`)

Ported from a sibling project (interview-os) and adapted to this repo's `PipelineStatus` shape. Read-only Gmail scan + Gemini classification, entirely client-side, no backend. **Full design doc: `emailAgentArchitecture.md`** — read that before changing anything here, it covers the sync flow, the approval queue, and a history of things already tried and reverted (model choices, rate limiting, search breadth).

The short version: `syncEmails` never mutates the pipeline directly — it fetches + batch-analyzes emails via Gemini (`analyzeRecruitingEmailsBatch`, `BATCH_SIZE = 10`, the main lever against free-tier RPM/RPD limits) and turns actionable results into `pending` suggestions in the `email_agent_log` (`localStorage`, also the dedup source). The user reviews and approves/rejects each suggestion (`SuggestionReview.tsx`) before anything touches `usePipelineStore` — `approveSuggestion`/`approveAllPending` in `useEmailAgent.ts` are the only things that ever call `EmailAgentStore`'s mutators.
