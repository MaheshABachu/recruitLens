-- Read-only aggregates for the Company Questions tab, called via
-- supabase.rpc() from src/lib/companyStats.ts. Both are SECURITY INVOKER, so
-- RLS still applies: leetcode_solves only ever yields the caller's own rows,
-- which makes `solved` per-user (and 0 for anon) with no auth.uid() filter.

-- One row per requested company (matched case-insensitively, like
-- getCompanyQuestions): distinct questions across all time windows, how many
-- were asked in the last 30 days, the difficulty mix, and how many of them the
-- caller has solved (via the LeetCode sync's leetcode_solves).
create or replace function public.company_stats(names text[])
returns table (
  name    text,
  total   int,
  hot     int,
  easy    int,
  medium  int,
  hard    int,
  solved  int
)
language sql
stable
security invoker
set search_path = public
as $$
  with picked as (
    select c.id, c.name
    from lc_companies c
    where c.name_lower = any (select lower(n) from unnest(names) as n)
  ),
  company_qs as (
    select p.name, cq.question_id, bool_or(cq.time_window = '30days') as is_hot
    from picked p
    join lc_company_questions cq on cq.company_id = p.id
    group by p.name, cq.question_id
  ),
  my_solved as (
    select distinct lp.slug
    from leetcode_solves s
    join leetcode_problems lp on lp.id = s.problem_id
  )
  select
    cq.name,
    count(*)::int,
    count(*) filter (where cq.is_hot)::int,
    count(*) filter (where q.difficulty = 'easy')::int,
    count(*) filter (where q.difficulty = 'medium')::int,
    count(*) filter (where q.difficulty = 'hard')::int,
    count(ms.slug)::int
  from company_qs cq
  join lc_questions q on q.id = cq.question_id
  left join my_solved ms on ms.slug = q.slug
  group by cq.name;
$$;

-- The questions the most companies asked in the last 30 days, with up to
-- three of those companies (highest frequency first) for the "asked at" chips.
create or replace function public.trending_questions(max_rows int default 10)
returns table (
  title         text,
  slug          text,
  difficulty    text,
  leetcode_url  text,
  company_count int,
  companies     text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    q.title,
    q.slug,
    q.difficulty,
    q.leetcode_url,
    count(distinct cq.company_id)::int as company_count,
    (array_agg(c.name order by cq.frequency_score desc))[1:3] as companies
  from lc_company_questions cq
  join lc_questions q on q.id = cq.question_id
  join lc_companies c on c.id = cq.company_id
  where cq.time_window = '30days'
  group by q.id
  order by company_count desc, q.title
  limit greatest(1, least(max_rows, 50));
$$;

revoke execute on function public.company_stats(text[]) from public;
revoke execute on function public.trending_questions(int) from public;
grant execute on function public.company_stats(text[]) to anon, authenticated;
grant execute on function public.trending_questions(int) to anon, authenticated;
