-- Job board: postings imported daily from three GitHub-hosted new-grad job
-- lists (jobright-ai/2026-Software-Engineer-New-Grad, speedyapply/2027-SWE-College-Jobs's
-- NEW_GRAD_USA.md, SimplifyJobs/New-Grad-Positions) via scripts/import-job-postings.ts.
-- Dedup key is url_key (apply link, normalized) — the same job posted in
-- multiple source lists collapses into one row with multiple `sources`.

create table job_postings (
  id                       uuid primary key default gen_random_uuid(),
  company                  text not null,
  company_url              text,
  title                    text not null,
  location                 text,
  url                      text not null,
  url_key                  text generated always as (lower(regexp_replace(url, '[?#].*$', ''))) stored,
  category                 text,
  work_model               text,
  salary                   text,
  requires_us_citizenship  boolean not null default false,
  no_sponsorship           boolean not null default false,
  is_faang                 boolean not null default false,
  advanced_degree_required boolean not null default false,
  is_closed                boolean not null default false,
  date_posted              date,
  sources                  text[] not null default '{}',
  first_seen_at            timestamptz not null default now(),
  last_seen_at             timestamptz not null default now(),
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint job_postings_url_key_key unique (url_key)
);

create index job_postings_active_idx on job_postings (is_active, date_posted desc);

alter table job_postings enable row level security;

create policy "job_postings_anon_all" on job_postings for all to anon, authenticated using (true) with check (true);
