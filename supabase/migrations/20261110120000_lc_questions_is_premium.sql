-- LeetCode Premium (paid-only) flag per question, so the UI can tag problems
-- that open behind LeetCode's paywall. The company-wise CSV source has no such
-- column; scripts/import-premium-flags.ts fills it from LeetCode's public
-- GraphQL questionList (isPaidOnly). null = not looked up yet / not found.

alter table public.lc_questions
  add column if not exists is_premium boolean;

-- company_questions(): add 'is_premium' to each element.
create or replace function public.company_questions(company_name text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'problem_name', q.title,
        'problem_slug', q.slug,
        'difficulty', q.difficulty,
        'frequency_score', cq.frequency_score,
        'time_window', cq.time_window,
        'leetcode_url', q.leetcode_url,
        'is_premium', coalesce(q.is_premium, false),
        'topics', coalesce(t.topics, '[]'::jsonb)
      )
      order by cq.id
    ),
    '[]'::jsonb
  )
  from lc_companies c
  join lc_company_questions cq on cq.company_id = c.id
  join lc_questions q on q.id = cq.question_id
  left join lateral (
    select jsonb_agg(tp.name order by tp.name) as topics
    from lc_question_topics qt
    join lc_topics tp on tp.id = qt.topic_id
    where qt.question_id = q.id
  ) t on true
  where c.name_lower = lower(company_name);
$$;

-- trending_questions(): return type changes, so drop and recreate.
drop function if exists public.trending_questions(int);

create function public.trending_questions(max_rows int default 10)
returns table (
  title         text,
  slug          text,
  difficulty    text,
  leetcode_url  text,
  is_premium    boolean,
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
    coalesce(q.is_premium, false) as is_premium,
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

revoke execute on function public.trending_questions(int) from public;
grant execute on function public.trending_questions(int) to anon, authenticated;
