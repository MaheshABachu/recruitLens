-- Enforce the paywall in the database, not just the UI.
--
-- Before this, job/internship postings and the company question bank were
-- readable with the public anon key, so the paywall only hid the app. Worse,
-- the lc_* tables had `for all ... using (true)` policies for anon, letting
-- anyone insert/update/delete the question bank through PostgREST.
--
-- Now:
--   * has_app_access(): the caller has a trialing/active/past_due
--     subscription, or their account is younger than the free trial
--     (FREE_TRIAL_DAYS in src/lib/billing.ts — keep the interval in sync).
--   * job_postings, internship_postings, lc_company_questions: readable only
--     by signed-in users with access. company_questions(), company_stats()
--     and trending_questions() are SECURITY INVOKER, so they inherit this.
--   * lc_companies / lc_questions / lc_topics / lc_question_topics /
--     company_domains: public read-only (names and LeetCode metadata, no
--     company tagging). All client write privileges revoked.
--   * landing_stats(): counts for the signed-out landing page.
-- The importers use the service role and bypass RLS.

create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid() and s.status in ('trialing', 'active', 'past_due')
  ) or exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.created_at > now() - interval '3 days'
  );
$$;

revoke execute on function public.has_app_access() from public, anon;
grant execute on function public.has_app_access() to authenticated;

-- Paid data -----------------------------------------------------------------

drop policy if exists job_postings_read on public.job_postings;
create policy job_postings_read_with_access on public.job_postings
  for select to authenticated using ((select public.has_app_access()));

drop policy if exists internship_postings_read on public.internship_postings;
create policy internship_postings_read_with_access on public.internship_postings
  for select to authenticated using ((select public.has_app_access()));

drop policy if exists lc_company_questions_anon_all on public.lc_company_questions;
create policy lc_company_questions_read_with_access on public.lc_company_questions
  for select to authenticated using ((select public.has_app_access()));

-- Public reference data, read-only ------------------------------------------

drop policy if exists lc_companies_anon_all on public.lc_companies;
create policy lc_companies_read on public.lc_companies for select to anon, authenticated using (true);

drop policy if exists lc_questions_anon_all on public.lc_questions;
create policy lc_questions_read on public.lc_questions for select to anon, authenticated using (true);

drop policy if exists lc_topics_anon_all on public.lc_topics;
create policy lc_topics_read on public.lc_topics for select to anon, authenticated using (true);

drop policy if exists lc_question_topics_anon_all on public.lc_question_topics;
create policy lc_question_topics_read on public.lc_question_topics for select to anon, authenticated using (true);

-- Belt and braces: clients never write any of these tables.
revoke insert, update, delete, truncate, references, trigger
  on public.job_postings, public.internship_postings,
     public.lc_companies, public.lc_company_questions, public.lc_questions,
     public.lc_topics, public.lc_question_topics, public.company_domains
  from anon, authenticated;

revoke select on public.job_postings, public.internship_postings, public.lc_company_questions from anon;

-- Landing page counts -------------------------------------------------------

create or replace function public.landing_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'companies', (select count(*) from public.lc_companies),
    'questions', (select count(*) from public.lc_questions),
    'active_jobs', (select count(*) from public.job_postings where is_active),
    'active_internships', (select count(*) from public.internship_postings where is_active)
  );
$$;

revoke execute on function public.landing_stats() from public;
grant execute on function public.landing_stats() to anon, authenticated;
