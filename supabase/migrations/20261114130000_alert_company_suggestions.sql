-- Company recommendations for the job-alerts intake: the companies with the
-- most open postings of the kind(s) and categories the user picked.
-- SECURITY INVOKER, so the posting tables' has_app_access() RLS still applies.
-- Neither kind / no categories = no filter on that dimension. Returns raw
-- company spellings; the client folds them with companyKey().
create function public.alert_company_suggestions(
  want_jobs boolean,
  want_internships boolean,
  pick_categories text[],
  max_rows int default 40
)
returns table (company text, postings bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with picked as (
    select p.company, p.category
    from public.job_postings p
    where (want_jobs or not want_internships) and p.is_active and not coalesce(p.is_closed, false)
    union all
    select p.company, p.category
    from public.internship_postings p
    where (want_internships or not want_jobs) and p.is_active and not coalesce(p.is_closed, false)
  )
  select company, count(*) as postings
  from picked
  where company is not null
    and (cardinality(pick_categories) = 0 or category = any (pick_categories))
  group by company
  order by postings desc, company
  limit least(greatest(max_rows, 1), 100);
$$;

revoke execute on function public.alert_company_suggestions(boolean, boolean, text[], int) from public, anon;
grant execute on function public.alert_company_suggestions(boolean, boolean, text[], int) to authenticated;
