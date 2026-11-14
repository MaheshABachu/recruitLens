-- Job alerts, phase 1: store what each user wants to hear about.
-- See communicationPlan.md. Nothing reads these to send mail yet; phase 2
-- adds match_new_postings() and the send-alerts Edge Function, which write
-- alert_deliveries / alert_runs with the service role.

-- Intake prompt --------------------------------------------------------------

-- null = the alerts intake hasn't been shown yet. No backfill: existing
-- accounts are meant to see it once on their next visit. Finishing or
-- skipping both set it.
alter table public.profiles add column alerts_prompted_at timestamptz;

-- Same column-grant pattern as onboarded_at (profiles_update_own policy
-- already scopes updates to the caller's own row).
grant update (alerts_prompted_at) on public.profiles to authenticated;

-- Preferences ----------------------------------------------------------------

create table public.alert_preferences (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  wants_jobs        boolean not null default false,
  wants_internships boolean not null default false,
  -- The five normalized posting categories.
  categories        text[] not null default '{}'
                    check (categories <@ array['Software', 'AI/ML/Data', 'Hardware', 'Product', 'Quant']::text[]),
  -- Optional narrowing filters; empty = no filter.
  title_keywords    text[] not null default '{}',
  work_models       text[] not null default '{}'
                    check (work_models <@ array['Remote', 'Hybrid', 'On Site']::text[]),
  locations         text[] not null default '{}',
  needs_sponsorship boolean not null default false,
  any_faang         boolean not null default false,
  email_enabled     boolean not null default false,
  frequency         text not null default 'instant' check (frequency in ('instant', 'daily')),
  -- IANA zone from the browser at save time; daily digests go out at 9am local.
  timezone          text,
  -- Public unsubscribe links carry this instead of a login. Not client-writable.
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Turning email on requires a usable filter.
  constraint alert_preferences_complete check (
    not email_enabled
    or ((wants_jobs or wants_internships) and cardinality(categories) > 0)
  ),
  constraint alert_preferences_list_sizes check (
    cardinality(title_keywords) <= 20 and cardinality(locations) <= 20
  )
);

create function public.alert_preferences_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger alert_preferences_touch
  before update on public.alert_preferences
  for each row execute function public.alert_preferences_touch();

alter table public.alert_preferences enable row level security;

create policy alert_preferences_select_own on public.alert_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy alert_preferences_insert_own on public.alert_preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy alert_preferences_update_own on public.alert_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Column grants keep unsubscribe_token / timestamps server-controlled.
revoke all on public.alert_preferences from anon, authenticated;
grant select on public.alert_preferences to authenticated;
grant insert (user_id, wants_jobs, wants_internships, categories, title_keywords,
              work_models, locations, needs_sponsorship, any_faang,
              email_enabled, frequency, timezone)
  on public.alert_preferences to authenticated;
grant update (wants_jobs, wants_internships, categories, title_keywords,
              work_models, locations, needs_sponsorship, any_faang,
              email_enabled, frequency, timezone)
  on public.alert_preferences to authenticated;

-- Ideal companies --------------------------------------------------------------

-- Separate from user_companies pins (pins are only offered as suggestions).
-- name_key is normalized the same way as src/lib/faangCompanies.ts, so
-- "Amazon Web Services (AWS)" and "Amazon" can match at send time.
create table public.alert_companies (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name_key     text not null check (name_key <> ''),
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, name_key)
);

alter table public.alert_companies enable row level security;

create policy alert_companies_select_own on public.alert_companies
  for select to authenticated using ((select auth.uid()) = user_id);
create policy alert_companies_insert_own on public.alert_companies
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy alert_companies_delete_own on public.alert_companies
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.alert_companies from anon, authenticated;
grant select, delete on public.alert_companies to authenticated;
grant insert (user_id, name_key, display_name) on public.alert_companies to authenticated;

-- Deliveries (written by send-alerts, phase 2) -------------------------------

create table public.alert_deliveries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  posting_kind text not null check (posting_kind in ('jobs', 'internships')),
  -- job_postings.id or internship_postings.id depending on posting_kind;
  -- no FK since it spans two tables (postings are soft-deleted, never removed).
  posting_id   uuid not null,
  channel      text not null default 'email' check (channel in ('email')),  -- 'sms' later
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  digest_id    uuid,
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  -- Never alert the same user about the same posting twice per channel.
  unique (user_id, posting_kind, posting_id, channel)
);

create index alert_deliveries_queued_idx on public.alert_deliveries (user_id, posting_kind)
  where status = 'queued';

alter table public.alert_deliveries enable row level security;

create policy alert_deliveries_select_own on public.alert_deliveries
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.alert_deliveries from anon, authenticated;
grant select on public.alert_deliveries to authenticated;

-- Runs (service role only) ----------------------------------------------------

create table public.alert_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- Matching window for the next run: postings with first_seen_at > watermark.
  watermark   timestamptz,
  matched     int not null default 0,
  sent        int not null default 0,
  error       text
);

alter table public.alert_runs enable row level security;
-- No policies: only the service role (which bypasses RLS) touches it.
revoke all on public.alert_runs from anon, authenticated;
