# RecruitLens — LeetCode Sync Build Plan

**Context:** Pipeline is built and working (per the screenshot). This is the next feature, not a rebuild — it extends the existing app rather than replacing anything in it.

**Immediate problem this plan has to solve first:** there's currently no home for a "connect LeetCode" action. The topbar only has an inbox icon and a theme toggle; Practice — LeetCode sync's natural destination — is a disabled "SOON" tab. Don't unlock all of Practice just to ship sync. Ship sync's plumbing and a minimal connection UI now; let full Practice (division matrix, coverage, spaced repetition) come later as its own pass once there's real synced data to display.

---

## 1. Where the connect flow lives right now

Add a settings entry point to the topbar — a gear icon alongside the existing inbox/theme icons. Clicking it opens a small panel containing just the LeetCode connect card (username input → connect → progress → connected state with basic stats). This is the same shape as the original mockup's settings dropdown, just arriving now instead of at launch, because this is the first feature that actually needs it.

Do not build a NeetCode connect card — confirmed earlier, there's nothing to connect to. If NeetCode-derived coverage (matching solves against public list data) ships later, it happens silently inside Practice, not as a second connect flow here.

**Why gate it behind a real feature instead of shipping it earlier as scaffolding:** an empty settings panel with nothing to configure is worse than no settings icon, same reasoning already applied to the disabled tabs.

---

## 2. Data Model (Supabase)

```
leetcode_accounts
  user_id (fk)
  username
  last_synced_at
  sync_status         -- 'idle' | 'syncing' | 'error'
  last_error          -- nullable, for surfacing a real message instead of a silent failure

problems
  id
  slug                -- unique, e.g. "two-sum"
  title
  difficulty           -- 'Easy' | 'Medium' | 'Hard'

solves
  id
  user_id (fk)
  problem_id (fk)
  solved_at
  UNIQUE (user_id, problem_id)   -- upsert target; a resync shouldn't create duplicates
```

`curated_lists` / `curated_list_items` (Blind 75, NeetCode 150/250, Grind 169) can be seeded later, right before Practice actually needs them for coverage math — no reason to build that table before anything reads from it.

---

## 3. Backend: Sync Job

**Adapter module, isolated on purpose:** `services/leetcodeAdapter.ts` (or a Supabase Edge Function of the same name) is the *only* place that knows the shape of LeetCode's GraphQL response. Every other part of the system reads from the `solves` table, never from a raw API response. If LeetCode changes their endpoint, exactly one file needs fixing.

1. Given a username, call the public (unauthenticated) GraphQL endpoint for:
   - Profile stats (solved counts by difficulty) — used for the "N solved / N medium" summary in the connect card.
   - Recent accepted submissions (slug + timestamp) — used to populate `solves`.
2. Upsert into `problems` (insert if the slug is new) and `solves` (on conflict `user_id, problem_id`, update `solved_at` to the latest).
3. Update `leetcode_accounts.last_synced_at` and `sync_status`.
4. Wrap the whole call in try/catch — on failure, set `sync_status = 'error'` and store `last_error` with something the UI can actually show ("Couldn't reach LeetCode — try again in a bit"), not a raw stack trace.

**Triggering it:**
- On-demand: the "Connect" button in the UI calls this synchronously (or via a queued job if it's slow) and the UI polls/subscribes for status.
- Scheduled: `pg_cron` once a day per connected account, so data doesn't go stale between visits without the user having to remember to click sync.
- Rate limit: this is someone else's undocumented endpoint — no polling, no retry storms. A single conservative daily cron plus manual on-demand is enough.

**Fallback:** a manual CSV import path (LeetCode lets users export submission history) so the feature has a path forward if the GraphQL endpoint gets blocked or changed. Doesn't need to ship in v1, but the `solves` upsert logic should already be written generically enough that a CSV-driven import can call the same upsert function the API-driven one does — one ingestion function, two triggers.

---

## 4. Frontend

**New hook, same pattern as `usePipelineStore`:**

```
useLeetCodeSync()
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  stats: { solved, medium, streak } | null
  lastSyncedAt: string | null
  error: string | null
  connect(username): void
  resync(): void
```

Internally this calls the Supabase Edge Function and subscribes to the row in `leetcode_accounts` for status updates (Supabase Realtime, or simple polling every couple seconds while `status === 'connecting'` — polling is simpler and fine at this scale, don't reach for Realtime unless the polling UX actually feels bad).

**Component:** `SettingsPanel` → `LeetCodeConnectCard`, mirroring the mockup's states:
- Disconnected: username input + Connect button.
- Connecting: progress indicator + status text pulled from `sync_status`/a step field, not faked client-side animation this time — the backend is doing real work, so the UI should reflect real state, even if that means a simpler "syncing…" spinner instead of the mockup's scripted step-by-step log.
- Connected: solved/medium/streak stats + last-synced timestamp + a "Resync" action.
- Error: the stored `last_error` message + a retry button.

Follow the existing rule from the Pipeline plan: this hook owns the data; components only read from it and call its actions, never touch Supabase directly.

---

## 5. Build Order

1. Supabase tables (`leetcode_accounts`, `problems`, `solves`) + the upsert function, tested directly against the database before any UI exists.
2. The adapter module + Edge Function, tested against a real LeetCode username from a script or Postman-equivalent — confirm the actual response shape before writing frontend code against assumptions about it.
3. `useLeetCodeSync` hook, backend-only (no UI yet) — verify it correctly reflects connect → syncing → connected/error against the real Edge Function.
4. Settings gear icon + panel + `LeetCodeConnectCard`, wired to the hook.
5. Daily cron for background resync — last, since it's the least urgent piece for proving the feature works end-to-end.

## 6. Open Decisions

- Should a failed sync silently retry once, or surface the error immediately? (Recommend: surface immediately — silent retries hide a broken integration from you until a user complains.)
- Does "Connect" block the UI until the first sync completes, or connect immediately and sync in the background with a visible "syncing" state? (Recommend background — first sync could take a few seconds to a minute depending on submission history size, no reason to freeze the panel.)
- Where does `solved` count surface before Practice exists? Simplest answer: nowhere yet, beyond the settings panel's own summary — resist the urge to bolt a stat onto the Pipeline UI just because the data now exists. Wait for Practice.