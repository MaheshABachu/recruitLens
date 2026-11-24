-- Win-back emails after the free trial ends: one a day for the two days after
-- (scripts/send-trial-reminders.ts, stages ended_day_1 / ended_day_2).

alter table public.trial_reminders drop constraint trial_reminders_stage_check;
alter table public.trial_reminders
  add constraint trial_reminders_stage_check
  check (stage in ('2_days', '1_day', 'today', 'ended_day_1', 'ended_day_2'));

-- Now covers the trial (3 days — keep in sync with FREE_TRIAL_DAYS and
-- has_app_access_for()) plus the 2 days after it, and says whether the user
-- had job-alert emails on (the win-back copy mentions them).
drop function public.trial_reminder_recipients();

create function public.trial_reminder_recipients()
returns table (user_id uuid, email text, created_at timestamptz, timezone text, alerts_on boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email, u.created_at, p.timezone, coalesce(p.email_enabled, false)
  from auth.users u
  left join public.alert_preferences p on p.user_id = u.id
  where u.email is not null
    and u.created_at > now() - interval '5 days'
    and not exists (
      select 1 from public.subscriptions s
      where s.user_id = u.id and s.status in ('trialing', 'active', 'past_due')
    )
    and not exists (
      select 1 from public.complimentary_access c where c.user_id = u.id
    );
$$;

revoke execute on function public.trial_reminder_recipients() from public, anon, authenticated;
grant execute on function public.trial_reminder_recipients() to service_role;
