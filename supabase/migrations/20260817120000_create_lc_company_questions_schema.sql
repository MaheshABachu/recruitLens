-- LeetCode "asked by company" tag dimension/fact schema.
-- Source data: github.com/liquidslr/leetcode-company-wise-problems, imported via
-- scripts/import-company-questions.ts. lc_-prefixed to stay distinct from the
-- pipeline job-tracker `companies`/`roles` tables (matched only by free-text
-- name, never a real FK, since coverage differs).

create table lc_companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  name_lower text generated always as (lower(name)) stored,
  created_at timestamptz not null default now(),
  constraint lc_companies_name_lower_key unique (name_lower)
);

create table lc_questions (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,
  title        text not null,
  difficulty   text check (difficulty in ('easy','medium','hard')),
  leetcode_url text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lc_questions_slug_key unique (slug)
);

create table lc_topics (
  id   uuid primary key default gen_random_uuid(),
  name text not null,
  constraint lc_topics_name_key unique (name)
);

create table lc_question_topics (
  question_id uuid not null references lc_questions(id) on delete cascade,
  topic_id    uuid not null references lc_topics(id) on delete cascade,
  primary key (question_id, topic_id)
);
create index lc_question_topics_topic_id_idx on lc_question_topics(topic_id);

create table lc_company_questions (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references lc_companies(id) on delete cascade,
  question_id     uuid not null references lc_questions(id) on delete cascade,
  time_window     text not null check (
                    time_window in ('30days','3months','6months','6months_plus','all_time')
                  ),
  frequency_score double precision not null default 0,
  acceptance_rate double precision,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint lc_company_questions_unique unique (company_id, question_id, time_window)
);
create index lc_company_questions_company_window_idx on lc_company_questions(company_id, time_window);
create index lc_company_questions_question_idx on lc_company_questions(question_id);

alter table lc_companies         enable row level security;
alter table lc_questions         enable row level security;
alter table lc_topics            enable row level security;
alter table lc_question_topics   enable row level security;
alter table lc_company_questions enable row level security;

create policy "lc_companies_anon_all"         on lc_companies         for all to anon, authenticated using (true) with check (true);
create policy "lc_questions_anon_all"         on lc_questions         for all to anon, authenticated using (true) with check (true);
create policy "lc_topics_anon_all"            on lc_topics            for all to anon, authenticated using (true) with check (true);
create policy "lc_question_topics_anon_all"   on lc_question_topics   for all to anon, authenticated using (true) with check (true);
create policy "lc_company_questions_anon_all" on lc_company_questions for all to anon, authenticated using (true) with check (true);
