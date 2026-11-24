-- Job alerts: finer send intervals, blocked companies, and a "block defense
-- tech" switch.

-- Frequency ---------------------------------------------------------------------

-- 'instant' / 'daily' become '30m' / '24h'; '4h', '6h' and '12h' are new.
-- 24h is still the 9am-local digest; the others send at most once per interval
-- (scripts/send-job-alerts.ts). The touch trigger below folds the old values,
-- so a client still on the previous build keeps saving fine.
alter table public.alert_preferences drop constraint alert_preferences_frequency_check;

update public.alert_preferences
set frequency = case frequency when 'instant' then '30m' when 'daily' then '24h' else frequency end
where frequency in ('instant', 'daily');

alter table public.alert_preferences
  alter column frequency set default '30m',
  add constraint alert_preferences_frequency_check check (frequency in ('30m', '4h', '6h', '12h', '24h'));

create or replace function public.alert_preferences_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  if new.frequency = 'instant' then
    new.frequency := '30m';
  elsif new.frequency = 'daily' then
    new.frequency := '24h';
  end if;
  return new;
end;
$$;

drop trigger alert_preferences_touch on public.alert_preferences;
create trigger alert_preferences_touch
  before insert or update on public.alert_preferences
  for each row execute function public.alert_preferences_touch();

-- Defense switch ----------------------------------------------------------------

-- Matched in TS against src/lib/defenseCompanies.ts, like is_faang.
alter table public.alert_preferences
  add column exclude_defense boolean not null default false;

grant insert (exclude_defense), update (exclude_defense) on public.alert_preferences to authenticated;

-- Blocked companies -------------------------------------------------------------

-- Same shape and name_key normalization as alert_companies. A blocked company
-- is never emailed, even when it's also FAANG+ or in a picked location.
create table public.alert_excluded_companies (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name_key     text not null check (name_key <> ''),
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, name_key)
);

alter table public.alert_excluded_companies enable row level security;

create policy alert_excluded_companies_select_own on public.alert_excluded_companies
  for select to authenticated using ((select auth.uid()) = user_id);
create policy alert_excluded_companies_insert_own on public.alert_excluded_companies
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy alert_excluded_companies_delete_own on public.alert_excluded_companies
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.alert_excluded_companies from anon, authenticated;
grant select, delete on public.alert_excluded_companies to authenticated;
grant insert (user_id, name_key, display_name) on public.alert_excluded_companies to authenticated;

-- Last send per user ------------------------------------------------------------

-- The sender spaces 4h/6h/12h/24h emails from each user's last one.
create function public.alert_last_sent()
returns table (user_id uuid, last_sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id, max(d.sent_at)
  from public.alert_deliveries d
  where d.status = 'sent' and d.sent_at > now() - interval '3 days'
  group by d.user_id;
$$;

revoke execute on function public.alert_last_sent() from public, anon, authenticated;
grant execute on function public.alert_last_sent() to service_role;
