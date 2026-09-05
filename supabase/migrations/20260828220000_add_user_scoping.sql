-- Converts personal data from a single shared pool (RLS `using (true)` for
-- anon+authenticated on every table) to real per-user ownership. Was a
-- deliberate early scope call to keep the app off the open internet while
-- gathering feedback (see CLAUDE.md), not a real multi-user design — the
-- app owner flagged it as a mistake to fix. Exactly one real user has ever
-- signed in (auth.users has 1 row), so every backfill below targets that
-- one account via `(select id from auth.users limit 1)`.
--
-- Out of scope, left untouched: leetcode_problems (shared LeetCode problem
-- metadata), lc_* (shared question-bank reference data), job_postings
-- (shared job board), media_sync_state/media_posts (dead code, no frontend
-- call site).

-- profiles: the actual "user table" — mirrors auth.users so the app has its
-- own row to hang future per-user preferences off of (e.g. an email-alert
-- opt-in).
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

insert into profiles (id, email)
select id, email from auth.users;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select to authenticated
  using (auth.uid() = id);


-- companies: add owner, backfill, tighten RLS to authenticated-only + owner
alter table companies add column user_id uuid references auth.users(id) on delete cascade;
update companies set user_id = (select id from auth.users limit 1);
alter table companies alter column user_id set not null;
create index companies_user_id_idx on companies (user_id);

drop policy "companies_all_access" on companies;
create policy "companies_owner_all" on companies
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- roles: no new column — scoped via parent company's user_id, since no role
-- mutator (updateRoleField/appendRoleNote) filters by anything but roles.id,
-- so deriving ownership through company_id is stronger than trusting a
-- client-supplied user_id on writes.
drop policy "roles_all_access" on roles;
create policy "roles_owner_all" on roles
  for all to authenticated
  using (exists (select 1 from companies c where c.id = roles.company_id and c.user_id = auth.uid()))
  with check (exists (select 1 from companies c where c.id = roles.company_id and c.user_id = auth.uid()));


-- leetcode_account: was a true singleton (id integer primary key default 1
-- check (id = 1)) — convert to a real per-user row keyed by user_id.
alter table leetcode_account add column user_id uuid references auth.users(id) on delete cascade;
update leetcode_account set user_id = (select id from auth.users limit 1);
alter table leetcode_account alter column user_id set not null;
alter table leetcode_account drop constraint leetcode_account_singleton;
alter table leetcode_account drop constraint leetcode_account_pkey;
alter table leetcode_account add primary key (user_id);
alter table leetcode_account drop column id;

drop policy "leetcode_account_anon_all" on leetcode_account;
create policy "leetcode_account_owner_all" on leetcode_account
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- leetcode_solves: add owner; the old `unique (problem_id)` meant one solve
-- per problem *globally* (wrong once multiple users can solve the same
-- problem) — replace with unique (user_id, problem_id).
alter table leetcode_solves add column user_id uuid references auth.users(id) on delete cascade;
update leetcode_solves set user_id = (select id from auth.users limit 1);
alter table leetcode_solves alter column user_id set not null;
create index leetcode_solves_user_id_idx on leetcode_solves (user_id);

alter table leetcode_solves drop constraint leetcode_solves_problem_id_key;
alter table leetcode_solves add constraint leetcode_solves_user_id_problem_id_key unique (user_id, problem_id);

drop policy "leetcode_solves_anon_all" on leetcode_solves;
create policy "leetcode_solves_owner_all" on leetcode_solves
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- email_sync_state: same singleton shape as leetcode_account (id integer
-- default 1, no explicit check constraint) — same conversion.
alter table email_sync_state add column user_id uuid references auth.users(id) on delete cascade;
update email_sync_state set user_id = (select id from auth.users limit 1);
alter table email_sync_state alter column user_id set not null;
alter table email_sync_state drop constraint email_sync_state_pkey;
alter table email_sync_state add primary key (user_id);
alter table email_sync_state drop column id;

drop policy "email_sync_state_all_access" on email_sync_state;
create policy "email_sync_state_owner_all" on email_sync_state
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
