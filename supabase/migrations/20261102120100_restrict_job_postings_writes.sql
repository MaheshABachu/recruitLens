-- job_postings_anon_all let anyone holding the public anon key insert, update
-- or delete postings. Clients only read this table, and the importer uses the
-- service role, which bypasses RLS.

drop policy if exists "job_postings_anon_all" on job_postings;

create policy "job_postings_read" on job_postings for select to anon, authenticated using (true);
