-- Onboarding tour: remembers per account (not per browser) that the user has
-- finished or skipped the spotlight tour (src/components/onboarding/OnboardingTour.tsx).
-- null = show the tour on their next visit to the app.

alter table public.profiles add column onboarded_at timestamptz;

-- Accounts that existed before the tour shipped don't get it pushed on them;
-- they can still replay it from the account menu.
update public.profiles set onboarded_at = now() where onboarded_at is null;

-- Clients may update their own row, but only the onboarded_at column.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant update (onboarded_at) on public.profiles to authenticated;
