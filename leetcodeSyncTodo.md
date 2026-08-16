# LeetCode Sync — Deferred

- [ ] Daily background resync via `pg_cron` (Supabase Postgres extension — runs SQL/a function on a schedule inside the DB, no external scheduler needed). Deferred out of the MVP build in `leetcodePlan.md` §5: manual Connect/Resync covers a single-user prototype; add this once daily freshness actually matters. Needs the `pg_cron` extension enabled on the `recruitLens` Supabase project before it can be scheduled.
