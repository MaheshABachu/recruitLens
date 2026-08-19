# Plan: Real Reddit sync for Media tracking (Discord stays mocked)

## Context

`MediaTracking.tsx` currently shows 5 hardcoded fake posts per company (Reddit + Discord), explicitly labeled "Mocked." We're making the Reddit half real. Research confirmed a key asymmetry: Reddit has a real, documented search API (OAuth app + client secret required, so server-side only, generous 100 req/min free tier) — but Discord has **no** site-wide search at all; a bot can only ever see servers it's explicitly invited into, and scraping public servers without that violates Discord's ToS. So **Discord stays mocked** (separate future feature); **Reddit becomes real**.

This follows the same shape as the existing `leetcode-sync` Edge Function (external API needs a secret, blocked from direct browser calls → Supabase Edge Function with service-role writes), not the email agent's client-only OAuth pattern (which only works because Gmail/Gemini allow authenticated browser calls).

**Search model:** a daily cron job does **one Reddit search per pipeline company per pipeline stage** — up to 5 searches per company per day (Applied / OA / Phone Screen / Onsite / Offer), each query combining the company name with stage-specific terms (e.g. `"Google" (onsite OR "final round")`), restricted to a curated list of career/interview subreddits. This builds a full per-company, per-stage library upfront — not just the company's current stage — so when a company's stage later changes, relevant content is already there. Results are genuinely per-company. Companies whose current role status is "Rejected" are skipped (no longer prepping). This is a large reduction vs. querying on every page view: for a ~15-company pipeline, that's ~75 searches/day total, run once by cron, versus potentially hundreds of on-demand searches if triggered per page load.

Each search is already stage-scoped, so results are stored directly tagged with the `(company_id, stage)` they were found under; no separate keyword-tagging pass needed.

## 1. Schema

New migration: `supabase/migrations/20260818120000_create_media_tracking_schema.sql`

```sql
create table media_posts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  stage       text not null check (stage in ('Applied','OA','Phone Screen','Onsite','Offer')),
  source      text not null default 'reddit' check (source in ('reddit')),
  external_id text not null,
  subreddit   text not null,
  title       text not null,
  snippet     text not null default '',
  url         text not null,
  score       integer not null default 0,
  posted_at   timestamptz not null,
  fetched_at  timestamptz not null default now(),
  constraint media_posts_unique unique (company_id, stage, source, external_id)
);
create index media_posts_company_stage_idx on media_posts (company_id, stage);
create index media_posts_score_idx on media_posts (score desc);

create table media_sync_state (
  id             integer primary key default 1 check (id = 1),
  sync_status    text not null default 'idle' check (sync_status in ('idle', 'syncing', 'error')),
  last_synced_at timestamptz,
  last_error     text
);
insert into media_sync_state (id) values (1);

alter table media_posts       enable row level security;
alter table media_sync_state  enable row level security;
create policy "media_posts_anon_all"      on media_posts      for all to anon, authenticated using (true) with check (true);
create policy "media_sync_state_anon_all" on media_sync_state for all to anon, authenticated using (true) with check (true);
```

`company_id` FKs to the real pipeline `companies` table (`on delete cascade` — if a company is removed from the pipeline, its cached posts go with it, matching the existing `roles` FK convention). `media_sync_state` stays a single global row tracking the overall daily batch run (not per-company granularity) — if one company's search fails mid-batch, log it and continue the rest; `last_error` reflects the most recent failure, `sync_status` reflects whether the last full run completed cleanly.

## 2. Cron mechanism

This project has never set up `pg_cron` before (LeetCode's daily resync was deferred and never built) — this is the first.

- **Step 1** (migration, no secrets — safe to check in): `supabase/migrations/20260818120100_enable_cron_and_net_extensions.sql` — `create extension if not exists pg_cron with schema extensions;` and same for `pg_net`.
- **Step 2** (do interactively via SQL editor/MCP `execute_sql`, **not** a migration file, since it's secret material): `select vault.create_secret('<service_role key or a purpose-built RSYNC_CRON_SECRET>', 'reddit_sync_invoke_key', '...');`
- **Step 3** (migration is fine — only references the secret by name):
  ```sql
  select cron.schedule(
    'reddit-sync-daily', '0 13 * * *',
    $$ select net.http_post(
      url := 'https://sytbbdmrkzfrpqtmioiv.supabase.co/functions/v1/reddit-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reddit_sync_invoke_key')
      ),
      body := '{}'::jsonb
    ); $$
  );
  ```

Open question to resolve during implementation, not blocking the plan: whether `apply_migration` can run Vault statements at all — if not, do steps 1-3 entirely via the SQL editor and note the discrepancy in the extensions migration file's comment so migration history doesn't silently diverge from live schema.

## 3. Edge Function `reddit-sync`

Deployed via Supabase dashboard, not repo code (same as `leetcode-sync`). Secrets: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` (Edge Function secrets), plus the always-available `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.

Fixed subreddit list: `cscareerquestions`, `leetcode`, `ExperiencedDevs`, `csMajors`, `recruitinghell`.

Per-stage query terms (combined with the company name):

```
Applied:      (applied OR referral OR application)
OA:           (OA OR "online assessment" OR "coding test")
Phone Screen: ("phone screen" OR "recruiter call" OR "phone interview")
Onsite:       (onsite OR "final round" OR loop)
Offer:        (offer OR negotiat)
```

Flow: set `media_sync_state.sync_status = 'syncing'` → OAuth client-credentials token fetch → `select id, name from companies where /* current role status <> 'Rejected' */` (via a join to `roles`, or however "current role" is already resolved elsewhere in this codebase — check `usePipelineStore.ts`'s existing logic for "active role" before reinventing it) → for each company × each of the 5 stages, call Reddit's site-wide search (`GET https://oauth.reddit.com/search?q={company} {stage_terms} subreddit:(cscareerquestions OR leetcode OR ExperiencedDevs OR csMajors OR recruitinghell)&sort=top&limit=10`) → upsert results into `media_posts` keyed `(company_id, stage, source, external_id)` (`onConflict`, refreshing `score`/`fetched_at` on resync) → set `sync_status = 'idle'`, `last_synced_at = now()`, `last_error = null` (or `'error'` + message, continuing past individual company/stage failures rather than aborting the whole batch).

~15 companies × 5 stages = ~75 search calls/day, sequential with natural network latency between them — far under the 100/min limit without needing artificial throttling.

## 4. Frontend changes

**`src/lib/mediaTracking.ts`** — extend, don't replace. Keep `MediaSource`/`getMockMediaPosts` (Discord, untouched). Add:
- `MediaStage = Extract<PipelineStatus, "Applied"|"OA"|"Phone Screen"|"Onsite"|"Offer">`
- `RedditPost` interface (`id, subreddit, title, snippet, url, score, stage, postedAt`) — a genuinely separate shape from the mock `MediaPost` (real `postedAt` timestamp formatted client-side vs. the mock's precomputed `timeAgo` string).
- `getMediaPosts(companyId: string, stage: PipelineStatus): Promise<RedditPost[]>` — short-circuits to `[]` for "Not Applied"/"Rejected" (no synced content by design), otherwise queries `media_posts` filtered by `company_id` and `stage`, `.order("score", {ascending: false})`, `.limit(20)`.
- `getMediaSyncState(): Promise<MediaSyncState | null>` — reads the singleton row.

**`src/hooks/useMediaPosts.ts`** (new) — mirrors `useCompanyQuestions.ts` exactly: `useState`/`useEffect` keyed on `[companyId, stage]`, `cancelled` guard, returns `{ posts, loading }`.

**`src/components/pipeline/MediaTracking.tsx`**:
- New required props: `companyId: string`, `stage: PipelineStatus` (alongside existing `companyName`, `expanded`, `onToggleExpanded` — `companyName` stays, still used for the Discord mock's templated snippets).
- Reddit section: `useMediaPosts(companyId, stage)`, `<LoadingSpinner />` while loading (reusing the component already built for `TopicProfile`/`CompanyQuestions`), then the real post list (title, snippet, subreddit, relative-time-formatted `postedAt`, score, links out via `url`).
- Add a passive "Reddit posts synced 3h ago" indicator from `getMediaSyncState()` — no manual sync button, kept scheduled/passive. Surface `last_error` inline if `sync_status === "error"`.
- Split the "Mocked..." disclaimer: keep it for Discord only; Reddit gets copy reflecting real synced data.
- Discord section otherwise fully unchanged.

**`src/components/pipeline/CompanyDetail.tsx`** — add `companyId={company.id}` and `stage={activeRole.status}` to the existing `<MediaTracking />` call (`company`/`activeRole` are already in scope there, already used for `<StatusBadge>`/`<PipelineTracker>`).

## 5. Verification

1. **De-risk first**: register a Reddit "script" app at reddit.com/prefs/apps before any other work, to confirm whether the rumored approval-gate blocks immediate credential issuance.
2. Apply the schema migration via Supabase MCP `apply_migration`, confirm via `list_tables` + `get_advisors`.
3. Deploy `reddit-sync` with its secrets set, **manually invoke it once** (dashboard "Invoke" or `functions.invoke`) before touching cron at all. Confirm via SQL: row count roughly matches `companies × ≤5 stages × ≤10`, `media_sync_state` flipped back to `idle` with fresh `last_synced_at`.
4. Spot-check a few companies' results by hand — for a company you recognize, do the "Onsite"-tagged posts actually read as onsite-interview content, not noise? Adjust the per-stage query terms if the first real batch shows obvious misses.
5. Only after step 3 proves a manual invocation works end-to-end, set up the cron schedule; confirm with `select * from cron.job`. Same-day firing may not be verifiable depending on session timing — note as a follow-up check, same pattern as `leetcodeSyncTodo.md`'s existing deferred-verification note for LeetCode.
6. `npm run dev`: open a couple of different companies at different stages, confirm the Reddit section shows different, company-specific posts per company+stage combination, spinner appears briefly on stage/company switch, "Not Applied"/"Rejected" shows a sensible empty state (not a blank gap), Discord section unchanged, `npx tsc -b` clean.
