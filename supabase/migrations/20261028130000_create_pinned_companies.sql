-- Per-user pinned companies for the Company Questions tab's quick-pick grid.
-- company_name matches lc_companies.name (free text, same as the rest of the
-- frontend's lookups — no FK, the question bank is reimported wholesale).

create table public.pinned_companies (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_name text not null,
  pinned_at    timestamptz not null default now(),
  primary key (user_id, company_name)
);

alter table public.pinned_companies enable row level security;

create policy "pinned_companies_select_own" on public.pinned_companies
  for select to authenticated using (auth.uid() = user_id);

create policy "pinned_companies_insert_own" on public.pinned_companies
  for insert to authenticated with check (auth.uid() = user_id);

create policy "pinned_companies_delete_own" on public.pinned_companies
  for delete to authenticated using (auth.uid() = user_id);
