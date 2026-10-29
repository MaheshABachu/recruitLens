-- One row per (user, company) holding that user's per-company flags for the
-- Company Questions tab. Replaces pinned_companies (pins carried over).
-- company_name matches lc_companies.name (free text, no FK — the question
-- bank is reimported wholesale).

create table public.user_companies (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_name   text not null,
  is_pinned      boolean not null default false,
  pinned_at      timestamptz,
  is_in_process  boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (user_id, company_name)
);

alter table public.user_companies enable row level security;

create policy "user_companies_select_own" on public.user_companies
  for select to authenticated using (auth.uid() = user_id);

create policy "user_companies_insert_own" on public.user_companies
  for insert to authenticated with check (auth.uid() = user_id);

create policy "user_companies_update_own" on public.user_companies
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_companies_delete_own" on public.user_companies
  for delete to authenticated using (auth.uid() = user_id);

insert into public.user_companies (user_id, company_name, is_pinned, pinned_at)
select user_id, company_name, true, pinned_at from public.pinned_companies;

drop table public.pinned_companies;
