-- Trial-ending reminder emails (scripts/send-trial-reminders.ts): "Your trial
-- ends in 2 days", "in 1 day", "today". Service role only.

-- One row per reminder sent, so each stage goes out at most once per user.
create table public.trial_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('2_days', '1_day', 'today')),
  sent_at timestamptz not null default now(),
  primary key (user_id, stage)
);

alter table public.trial_reminders enable row level security;
revoke all on public.trial_reminders from anon, authenticated;

-- Users still inside the free trial (account younger than 3 days — keep in
-- sync with FREE_TRIAL_DAYS and has_app_access_for()) who have no live
-- subscription, with their sign-in email and timezone if they set up alerts.
create function public.trial_reminder_recipients()
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
    );
$$;

revoke execute on function public.trial_reminder_recipients() from public, anon, authenticated;
grant execute on function public.trial_reminder_recipients() to service_role;
