-- Complimentary (lifetime) access: accounts listed here get the app forever,
-- independent of Stripe. Kept out of `subscriptions` because stripe-webhook
-- overwrites that row on every Stripe event.
create table public.complimentary_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  granted_at timestamptz not null default now()
);

alter table public.complimentary_access enable row level security;
revoke all on public.complimentary_access from anon, authenticated;
grant select on public.complimentary_access to authenticated;

-- Users can see their own grant (the client paywall reads it); only the
-- service role / SQL editor writes.
create policy complimentary_access_select_own on public.complimentary_access
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.has_app_access_for(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.complimentary_access c where c.user_id = uid
  ) or exists (
    select 1 from public.subscriptions s
    where s.user_id = uid and s.status in ('trialing', 'active', 'past_due')
  ) or exists (
    select 1 from auth.users u
    where u.id = uid and u.created_at > now() - interval '3 days'
  );
$$;

-- Don't send "your trial ends" emails to comped accounts.
create or replace function public.trial_reminder_recipients()
returns table (user_id uuid, email text, created_at timestamptz, timezone text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email, u.created_at, p.timezone
  from auth.users u
  left join public.alert_preferences p on p.user_id = u.id
  where u.email is not null
    and u.created_at > now() - interval '3 days'
    and not exists (
      select 1 from public.subscriptions s
      where s.user_id = u.id and s.status in ('trialing', 'active', 'past_due')
    )
    and not exists (
      select 1 from public.complimentary_access c where c.user_id = u.id
    );
$$;

insert into public.complimentary_access (user_id, note)
select id, 'founder / friend comp'
from auth.users
where lower(email) in ('zenlambertus@gmail.com')
on conflict (user_id) do nothing;
