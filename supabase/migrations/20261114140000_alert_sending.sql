-- Job alerts, phase 2: what scripts/send-job-alerts.ts reads with the service role.

-- has_app_access() reads auth.uid(), so the sender needs a per-user form.
-- has_app_access() now delegates to it, so the trial length lives in one
-- place (keep the interval in sync with FREE_TRIAL_DAYS in src/lib/billing.ts).
create function public.has_app_access_for(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid and s.status in ('trialing', 'active', 'past_due')
  ) or exists (
    select 1 from auth.users u
    where u.id = uid and u.created_at > now() - interval '3 days'
  );
$$;

revoke execute on function public.has_app_access_for(uuid) from public, anon, authenticated;
grant execute on function public.has_app_access_for(uuid) to service_role;

create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_app_access_for(auth.uid());
$$;

-- Everyone with email alerts on, with their sign-in email and whether they
-- still have app access (alerts pause when a trial or subscription ends).
create function public.alert_recipients()
returns table (user_id uuid, email text, has_access boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email, public.has_app_access_for(u.id)
  from public.alert_preferences p
  join auth.users u on u.id = p.user_id
  where p.email_enabled and u.email is not null;
$$;

revoke execute on function public.alert_recipients() from public, anon, authenticated;
grant execute on function public.alert_recipients() to service_role;

-- The sender looks up a user's queued deliveries and their last send.
create index alert_deliveries_user_sent_idx on public.alert_deliveries (user_id, sent_at desc)
  where status = 'sent';
