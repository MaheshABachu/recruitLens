-- Change detection for leetcode-sync's `mode: "check"` probe. The probe asks
-- LeetCode for only the newest accepted submission and compares its id to
-- latest_submission_id — the full sync only runs when they differ.
-- last_checked_at throttles client-triggered probes; last_changed_at bumps
-- only when a sync actually saw new submissions, so the frontend can refetch
-- solved slugs on that signal alone.

alter table public.leetcode_account
  add column latest_submission_id text,
  add column last_checked_at      timestamptz,
  add column last_changed_at      timestamptz;
