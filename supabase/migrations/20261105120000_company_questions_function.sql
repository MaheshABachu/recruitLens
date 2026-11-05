-- One-call loader for a company's question bank (src/lib/companyQuestions.ts).
-- Replaces paging lc_company_questions through PostgREST 1000 rows at a time
-- with nested embeds (6 sequential requests, ~2s for Google). Returns a single
-- jsonb array, so PostgREST's max-rows cap doesn't apply.
-- Keys match the frontend's CompanyQuestion shape.

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

revoke execute on function public.company_questions(text) from public;
grant execute on function public.company_questions(text) to anon, authenticated;
