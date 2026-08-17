-- Drop the legacy flat company_questions table, superseded by the
-- lc_companies / lc_questions / lc_topics / lc_question_topics /
-- lc_company_questions schema (see 20260817120000_create_lc_company_questions_schema.sql).
-- Apply only after the new schema is imported and verified.

drop table if exists company_questions;
