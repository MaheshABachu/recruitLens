-- Company name -> website domain, used to fetch logos (src/lib/companyLogos.ts).
-- Shared reference data like lc_companies/job_postings: readable by everyone,
-- written only by scripts/import-company-domains.ts with the service role.
--
-- name_key is lower(trim(name)) so "Meta", "meta " and lc_companies/job_postings
-- spellings that differ only in case share a row. domain is null when a lookup
-- found no confident match — the row still exists so the importer doesn't
-- re-query that name every run. source = 'manual' rows come from the
-- hand-curated map in the script and are never overwritten by lookups.

create table company_domains (
  name_key text primary key check (name_key = lower(btrim(name_key)) and name_key <> ''),
  domain text check (domain is null or domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  source text not null check (source in ('manual', 'logo_dev')),
  updated_at timestamptz not null default now()
);

alter table company_domains enable row level security;

create policy "company_domains_read" on company_domains for select to anon, authenticated using (true);
