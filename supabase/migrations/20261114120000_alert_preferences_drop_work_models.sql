-- Drop the Remote / Hybrid / On Site alert filter: ~90% of postings have no
-- work_model, so the filter would hide nearly everything. Dropping the column
-- also drops its column-level insert/update grants.
alter table public.alert_preferences drop column work_models;
