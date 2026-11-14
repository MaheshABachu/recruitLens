# Communication — job alerts by email (SMS later)

Goal: when the job sync sees a new posting that fits what a user told us they want, email them. SMS is deferred (see **Later: SMS**).

Status: Phases 0–2 built 2026-11-14 (branch `Communication`). Sending goes live once `RESEND_API_KEY` is added as a GitHub Actions secret; until then the workflow step skips itself. Phase 2 changed from the original design: sending is a Node step in `sync-jobs.yml` (`scripts/send-job-alerts.ts`), not a `send-alerts` Edge Function, so it reuses `companyKey()` / `locationMatches()` from `src/lib` and needs no `ALERTS_CRON_SECRET`. Matching runs in TS (`src/lib/alertMatching.ts`), not in a SQL `match_new_postings`. Supabase Auth SMTP → Resend is still a manual dashboard step.

## Facts that shape the design (checked 2026-11-09)

- ~140 new `job_postings` and ~166 new `internship_postings` per day (`first_seen_at` in the last 24 h); 1,600+ distinct companies.
- `category` is already normalized to five values in both tables: `Software`, `AI/ML/Data`, `Hardware`, `Product`, `Quant` (plus a dozen stray `Software Engineering` rows the importer should fold into `Software`).
- Sync runs every 30 min (`sync-jobs.yml`, dispatched by `pg_cron`). New rows are identifiable by `first_seen_at`.
- Company names differ between sources ("Amazon Web Services (AWS)" vs "Amazon"). `src/lib/faangCompanies.ts` already has a name normalizer + alias matching — reuse it for "ideal companies".
- Supabase's built-in mailer is test-only. Resend (account already exists) covers alert mail and can also be Supabase Auth's SMTP.
- 34 users today, so email cost is negligible.

## 1. Intake (what the user tells us)

New onboarding step **before** the driver.js tour (and after the paywall when billing is on), plus an editable **Alerts** screen from the account menu. Skippable and shown once per account (`profiles.alerts_prompted_at`) — existing accounts get it once on their next visit. Skipping leaves alerts off, with a nudge in the account menu.

Fields:

| Field | Input | Notes |
|---|---|---|
| Looking for | Job / Internship / Both | Required. Picks which table(s) we match. |
| Roles | Multi-select of the 5 categories | Required, at least one. |
| Role keywords | Optional free-text chips ("frontend", "backend", "ML infra") | Matched case-insensitively against `title`. Narrows, never widens. |
| Ideal companies | Typeahead over posting + `lc_companies` names, plus an "Any FAANG+" toggle | Pinned / in-process companies offered as one-tap suggestions. Empty = any company. |
| Location | Optional city/state chips | Matched against `location` text. No Remote/Hybrid/On-site filter: ~90% of postings have no `work_model` (dropped 2026-11-14). |
| Visa | "I need sponsorship" checkbox | Hides postings flagged `no_sponsorship` / `requires_us_citizenship` (same caveat as the visa chip — only Simplify labels these). |
| Email alerts | On/off, sent to the account email | Turning it on is the opt-in. |
| Frequency | Instant / Daily digest | Instant = sent within one sync cycle (~30 min). |

## 2. Data model (new migration)

```sql
alert_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  wants_jobs boolean, wants_internships boolean,
  categories text[], title_keywords text[],
  locations text[],
  needs_sponsorship boolean, any_faang boolean,
  email_enabled boolean,
  frequency text check (frequency in ('instant','daily')),
  timezone text,            -- browser tz at save time; digest send hour
  unsubscribe_token uuid default gen_random_uuid(),
  created_at, updated_at
)

alert_companies (
  user_id uuid references auth.users on delete cascade,
  name_key text,            -- normalized like faangCompanies.ts
  display_name text,
  primary key (user_id, name_key)
)

alert_deliveries (
  id, user_id, posting_kind text ('jobs'|'internships'), posting_id uuid,
  channel text ('email'),   -- 'sms' added later
  status text ('queued'|'sent'|'failed'|'skipped'),
  digest_id uuid null, error text, created_at, sent_at,
  unique (user_id, posting_kind, posting_id, channel)   -- never alert twice
)

alert_runs ( id, started_at, finished_at, watermark timestamptz, matched int, sent int, error text )

profiles.alerts_prompted_at timestamptz   -- null = intake not shown yet
```

RLS: users read/write their own `alert_preferences` / `alert_companies`, read their own `alert_deliveries`; `unsubscribe_token` not client-writable. `alert_runs` service-role only. `profiles.alerts_prompted_at` uses the same column-grant pattern as `onboarded_at`. Account deletion already cascades.

## 3. Matching

Decided 2026-11-14: companies and locations decide what gets in; roles and keywords decide what comes first. Code: `src/lib/alertMatching.ts` (`matchPosting`), run in TS by `scripts/send-job-alerts.ts`.

- **Hard filters:** the posting kind the user wants (jobs / internships); no known visa blocker when they need sponsorship; active, not closed, first seen since the last run, `date_posted` within ~3 days; user has app access (`alert_recipients()` / `has_app_access_for(uid)`); not already in `alert_deliveries`.
- **Gets in:** at one of their `alert_companies` (matched on `companyKey()`, so FAANG+ aliases count: Twitch is Amazon) or FAANG+ with `any_faang`, **or** in one of their locations (`locationMatches()`), whatever the role.
- **Fallback:** users with no companies, no FAANG+ toggle and no locations get every posting in their roles.
- **Ranking:** title-keyword hits first (their own "Matches your keywords" section at the top of the email), then postings in their roles, then company + location together, newest first on ties. Each posting carries a "why" line (company list / FAANG+ / location / keyword).
- **Caps:** 10 postings per email, then "and N more" with a link to the board.

## 4. Sending

New Edge Function `send-alerts` (service role, `--no-verify-jwt`, guarded by an `ALERTS_CRON_SECRET` header):

1. Read watermark from last `alert_runs` row → `match_new_postings(watermark)`.
2. Insert matches into `alert_deliveries` as `queued` (the unique constraint makes reruns safe).
3. Instant users: one email per user per kind per run. Daily users: leave queued; an hourly cron sends digests to users whose local time is 9am.
4. Mark `sent` / `failed`, advance watermark.

Trigger: the sync workflow calls it as its last step (fires right after new rows land); `pg_cron` hourly as a backstop for digests and missed runs.

**Email (Resend, domain `vantageprep.dev`):**
- Verify `vantageprep.dev` in Resend (SPF, DKIM, DMARC records at the DNS host).
- Internship matches from `internshipalerts@vantageprep.dev`, job matches from `jobalerts@vantageprep.dev`. A user who wants both gets separate emails per kind (separate digests too).
- No `Reply-To`; footer notes replies aren't read.
- Every mail: one-click `List-Unsubscribe` + `List-Unsubscribe-Post` headers and a footer link (`unsubscribe_token` → a public unsubscribe endpoint, no login), "manage alerts" link, postal address (CAN-SPAM).
- Also point Supabase Auth SMTP at Resend so sign-in / reset mail stops hitting the test mailer's rate limit.

## 5. Other touchpoints

- Privacy policy (`src/lib/legal.ts`, `LegalPage`): we store alert preferences and email matches; how to unsubscribe.
- Account menu: "Alerts" item + status ("Instant", "Daily", "Off", "Paused — trial ended").
- Landing page / paywall copy: alerts as a selling point.
- `CLAUDE.md`: document new tables, function, secrets (`RESEND_API_KEY`, `ALERTS_CRON_SECRET`).
- Importer: fold `Software Engineering` → `Software`, `Data Science, AI & Machine Learning` → `AI/ML/Data`.

## 6. Phases

0. **Now** — add and verify `vantageprep.dev` in Resend; create an API key; store it as Supabase secret `RESEND_API_KEY`.
1. **Preferences** — migration (`alert_*` tables, `profiles.alerts_prompted_at`), `src/lib/alerts.ts` + `useAlertPreferences`, intake step (onboarding for new users, one-time prompt for existing), Alerts screen in account menu. Shippable alone (stores prefs, sends nothing).
2. **Matching + email** — `has_app_access(user_id)`, `match_new_postings`, `send-alerts`, instant + daily digest, unsubscribe endpoint, email templates, legal page update, Auth SMTP → Resend.
3. **Polish** — "why you got this" line per posting, "not interested" feedback, weekly summary for quiet weeks.
4. **SMS** — see below.

## Decisions (2026-11-09)

1. **Email only for now; SMS deferred** because toll-free verification takes days to weeks. Schema keeps a `channel` column so SMS slots in without reworking deliveries.
2. **Frequency is an intake question** (Instant / Daily digest), asked per user, no app-wide default.
3. **Intake is skippable, prompted once.** New accounts see it in onboarding; existing accounts once on their next visit. Skip or finish both set `profiles.alerts_prompted_at`. The account menu's Alerts item stays available afterwards.
4. **Ideal companies are a separate list** (`alert_companies`), not pins. Pins are offered as suggestions.
5. **Alerts work during the free trial and stop when access ends.** Matching only includes users with `has_app_access(user_id)`; preferences are kept, so subscribing resumes alerts. Optional: one "your trial ended, alerts are paused" email.
6. **Senders:** `internshipalerts@vantageprep.dev` and `jobalerts@vantageprep.dev` via Resend.

7. **No replies.** Alert emails set no `Reply-To`; the footer says replies aren't monitored and points to "manage alerts" / unsubscribe instead.
8. **CAN-SPAM postal address:** 800 W 26th Street, Austin, TX (ZIP to add). Lives as a constant next to the operator details in `src/lib/legal.ts`, so the email template and legal pages share it.

## Open questions

None blocking.

## Later: SMS

Twilio, **toll-free number** with toll-free verification (chosen over 10DLC). When picked back up:
- Start verification first — needs business info, opt-in screenshots (the Alerts screen), sample messages.
- Add to `alert_preferences`: `sms_enabled`, `phone_e164`, `phone_verified_at`, `sms_consent_at` (last two server-written only).
- Phone OTP via Twilio Verify; explicit consent checkbox + stored timestamp (TCPA).
- STOP/HELP via Twilio Advanced Opt-Out, synced back by a `twilio-webhook` function that turns `sms_enabled` off.
- One short text per run covering both kinds, capped; quiet hours 9pm–8am user time.
- Privacy/terms: phone collection, message frequency, "msg & data rates may apply".
