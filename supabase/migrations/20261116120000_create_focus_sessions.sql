-- Focus sessions from the Vantage Focus Chrome extension (extension/):
-- one row per timed LeetCode/NeetCode session. The extension inserts the row
-- when a session starts (with a client-generated id) and updates it when the
-- session ends. Kept for future in-app stats.

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('leetcode', 'neetcode')),
  problem_slug text not null,
  problem_title text,
  mode text not null check (mode in ('ai', 'solutions', 'full')),
  planned_minutes int not null check (planned_minutes between 1 and 180),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text check (outcome in ('solved', 'timeout', 'aborted', 'abandoned')),
  hints_shown int not null default 0 check (hints_shown >= 0),
  struggles text[] not null default '{}'
);

create index focus_sessions_user_started_idx on public.focus_sessions (user_id, started_at desc);

alter table public.focus_sessions enable row level security;

create policy focus_sessions_select_own on public.focus_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Starting a session is a paid feature, like the rest of the app.
create policy focus_sessions_insert_own on public.focus_sessions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.has_app_access()));

create policy focus_sessions_update_own on public.focus_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.focus_sessions from anon, authenticated;
grant select on public.focus_sessions to authenticated;
grant insert (id, platform, problem_slug, problem_title, mode, planned_minutes, started_at)
  on public.focus_sessions to authenticated;
-- Only the end-of-session fields can change after the row is written.
grant update (ended_at, outcome, hints_shown, struggles) on public.focus_sessions to authenticated;
