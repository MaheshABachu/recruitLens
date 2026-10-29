# LeetCode Sync — Deferred

- [x] Automatic change detection — `leetcode-sync`'s `mode: "check"` probe runs on app load / tab refocus (throttled 5 min) and only does a full sync when LeetCode's newest accepted submission id changed.
- [ ] Background resync via `pg_cron` (Supabase Postgres extension — runs SQL/a function on a schedule inside the DB, no external scheduler needed). The client probe only fires while the app is open, so solving >20 problems between visits still loses the overflow to LeetCode's 20-submission cap. A scheduled probe (hourly, reusing `mode: "check"`) would close that gap. Needs `pg_cron` + `pg_net` enabled on the `recruitLens` project and a service-role code path in the function that iterates all connected accounts.
