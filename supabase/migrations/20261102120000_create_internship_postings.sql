-- Internship board: same shape as job_postings, imported by the same script
-- (scripts/import-job-postings.ts) from jobright-ai/2026-Software-Engineer-Internship,
-- speedyapply/2027-SWE-College-Jobs's README.md and SimplifyJobs/Summer2027-Internships.
-- Clients only read this table; the importer writes with the service role.

create table internship_postings (
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
  constraint internship_postings_url_key_key unique (url_key)
);

create index internship_postings_active_idx on internship_postings (is_active, date_posted desc);

alter table internship_postings enable row level security;

create policy "internship_postings_read" on internship_postings for select to anon, authenticated using (true);
