-- Remove the company application-tracking feature (pipeline + email agent +
-- mock media tracking). The frontend no longer reads or writes any of these.
-- lc_* question bank, leetcode_*, job_postings, and profiles are untouched.

drop table if exists public.media_posts;
drop table if exists public.media_sync_state;
drop table if exists public.roles;
drop table if exists public.companies;
drop table if exists public.email_sync_state;
