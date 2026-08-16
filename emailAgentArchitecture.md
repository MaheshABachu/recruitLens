# Email Agent Architecture

Read-only Gmail scan that classifies recruiting emails via Gemini and surfaces pipeline changes for the user to **approve or reject** — it never mutates the pipeline on its own. Entirely client-side — no backend, no database. State lives in React (`usePipelineStore`) and `localStorage`.

Ported from a sibling project (interview-os) and adapted to RecruitLens's `PipelineStatus` shape.

## Files

| File | Role |
|---|---|
| `src/lib/gmail.ts` | Google OAuth (GIS popup), Gmail search + fetch, token lifecycle, email body extraction |
| `src/lib/gemini.ts` | Thin wrapper around the Gemini REST API — also logs every request/response to console |
| `src/lib/emailAgent.ts` | `analyzeRecruitingEmailsBatch` — one Gemini call per batch of emails, structured JSON out |
| `src/hooks/useEmailAgent.ts` | Orchestrates a sync: fetch → analyze → build suggestions → log. Also owns approve/reject/undo |
| `src/components/email/EmailAgentButton.tsx` | Topbar icon, opens the panel |
| `src/components/email/EmailAgentPanel.tsx` | Connect/sync UI, hosts the summary + review queue + log |
| `src/components/email/SuggestionReview.tsx` | The approval queue — one row per pending suggestion, Approve/Reject (individual + bulk) |
| `src/components/email/EmailAgentLog.tsx` | `RecentUpdates` (last 5 *approved* status changes, with undo) + `FullAgentLog` (full table, everything) |

`App.tsx` wires `useEmailAgent()` and owns the `EmailAgentStore` object (`{ companies, addCompany, updateRoleField, appendRoleNote }`) — the narrow slice of `usePipelineStore()` the agent is allowed to touch. Every mutation goes through this interface, never the store directly, and only ever happens from an approve action — never from `syncEmails` itself.

## Auth & token lifecycle (`gmail.ts`)

- `initiateGoogleAuth` — opens a Google Identity Services (GIS) OAuth popup (no redirect), scope `gmail.readonly`. On success, token + expiry are cached in `localStorage` (`gmail_access_token`, `gmail_token_expiry`).
- `ensureFreshToken` — called at the start of every sync. If the cached token is still valid (more than 5 min from expiry, `REFRESH_SLACK`), returns it as-is. Otherwise calls `silentRefresh`, which requests a new token with `prompt: ""` — no popup shown if the browser still has an active Google session.
- If the Google session itself has expired, any Gmail call returns 401 → the fetch wrappers throw `Error("GMAIL_UNAUTHORIZED")`. `useEmailAgent` catches this specifically, clears the cached token, and surfaces "Gmail session expired — please reconnect."
- `disconnect()` just clears the two `localStorage` keys — no server-side token revocation.

Requires `VITE_GOOGLE_CLIENT_ID` in `.env.local`, and `http://localhost:5173` (or whatever the dev origin is) registered as an authorized JavaScript origin on that OAuth client in Google Cloud Console.

## Gmail search (`fetchRecruitingEmails`)

One Gmail search query, built from three parts, ANDed together:

- `category:primary` — restricts to the Primary tab, filters out Promotions/Social/Updates noise
- `newer_than:30d` — hard cap on how far back a sync looks
- `(KEYWORDS) OR from:(ATS_SENDERS)` — the actual content filter

`KEYWORDS` is a large OR'd list covering the full recruiting lifecycle — application ("interview", "applied", "candidacy"...), assessments/screening, scheduling, offers, rejections (most rejection emails never say "reject" — "thank you for your interest", "other candidates", "not moving forward" catch those), cold outreach ("came across your profile", "exploring opportunities"), and pre-employment ("background check", "onboarding"). It is **not** scoped to `subject:` — it matches subject or body, since narrower subject-only matching was found to miss real recruiting emails (see History below).

`ATS_SENDERS` is a `from:(...)` clause listing known applicant-tracking-system domains (greenhouse.io, lever.co, myworkday.com, icims.com, smartrecruiters.com, hirevue.com, ashbyhq.com, jobvite.com, criteriacorp.com) — this catches ATS platform mail regardless of subject wording, since the sender domain alone is a strong signal.

Capped at `maxResults=75`. This whole query is a **coarse pre-filter**, not the real classifier — it's deliberately broad, and the actual "is this really a recruiting email" judgment happens per-email in Gemini (see below). Tune the keyword list here if a sync is missing emails it should catch, or catching too much noise.

## Email body extraction (`extractEmailBody` in `gmail.ts`)

Gmail's MIME structure nests parts arbitrarily deep (`multipart/mixed` wrapping `multipart/alternative` wrapping the actual `text/plain`/`text/html` leaves, especially with attachments or inline images) — `findPart` walks it recursively rather than checking only the top level. Prefers `text/plain`; if only `text/html` exists, runs it through `htmlToText` (drops `<style>`/`<script>`/comments, turns block tags into line breaks, strips remaining markup, unescapes common entities) rather than sending raw markup to Gemini. The full body is sent — no truncation.

## Classification (`emailAgent.ts` → `gemini.ts`)

`analyzeRecruitingEmailsBatch(emails, knownCompanies)` sends **up to 10 emails in a single Gemini call** (`BATCH_SIZE` in `useEmailAgent.ts`), model `gemini-3.1-flash-lite` (see History for why this model specifically). This is the main lever against free-tier RPM/RPD limits — a 75-email sync is ~8 calls instead of 75. Prompt includes:

- The user's current pipeline company names, so Gemini can match against known entries
- Each email's subject, sender, and full body, labeled `--- EMAIL 0 ---`, `--- EMAIL 1 ---`, etc.
- An explicit rule to unwrap job-board sender platforms (LinkedIn, Indeed, Handshake, Glassdoor, ZipRecruiter, Lever, Greenhouse, Workday) — the sender domain is the platform, not the employer, so the prompt instructs Gemini to extract the actual hiring company from the subject/body instead (e.g. "your application was sent to Stripe" → `company_name: "Stripe"`)

Returns a JSON array, one object per email, in the same order, each tagged with its 0-based `index` (used to re-align results if Gemini reorders or drops an entry):

```ts
{
  index: number;
  company_name: string | null;
  is_recruiting_email: boolean;
  status_update: "not_applied" | "applied" | "oa" | "phone_screen" | "technical"
                | "onsite" | "offer" | "rejected" | null;
  key_info: string | null;   // one-sentence summary — deadline, next steps, interviewer, etc.
  confidence: "high" | "low";
}
```

`status_update` is only set when the email clearly signals a stage change — generic recruiter outreach with no concrete action maps to `null`. On any failure (network error, malformed JSON, non-array response), `analyzeRecruitingEmailsBatch` catches, logs to console, and returns an array of `null`s the same length as the input batch — every email in that batch falls back to "not a recruiting email" rather than the whole sync failing.

`gemini.ts`'s `callGemini` is a thin `fetch` wrapper — logs the full request (system instruction + prompt) and raw response text to console for every call, no retry, no rate limiting currently (see History — a rate limiter was added and then explicitly removed).

## Sync flow (`useEmailAgent.ts` → `syncEmails`)

`syncEmails` **never touches the pipeline**. It only produces `AgentLogEntry` rows — some carrying a `pending` suggestion, most not.

1. **Token refresh** — `ensureFreshToken()`.
2. **Search** — `fetchRecruitingEmails()`. If zero results, short-circuits with a "no emails found" summary.
3. **Dedup** — filters the search results against `email_agent_log` in `localStorage` (keyed by `gmail_message_id`), so a re-sync only processes genuinely new mail.
4. **Phase 1a — fetch, concurrent.** A fixed-size worker pool (`FETCH_CONCURRENCY = 10`) pulls from a shared index; each worker fetches the full email content from Gmail and extracts headers/body. Gmail API calls, not Gemini, so no batching concern here.
5. **Phase 1b — analyze, batched.** Fetched emails are chunked into groups of `BATCH_SIZE = 10` and sent to `analyzeRecruitingEmailsBatch` one chunk at a time.
6. **Phase 2 — build suggestions, sequential, in original message order.** For each analyzed email:
   - `is_recruiting_email: false` (or a classification failure) → logged as skipped, `review_status: "none"`.
   - No match + `company_name` + `confidence: "high"` → a `kind: "new_company"` suggestion (`review_status: "pending"`), proposing to add the company at the mapped status (or `"Applied"` if none was signaled).
   - Matched an existing company, and the mapped status genuinely outranks the role's current status (`STATUS_RANK` — `Not Applied` < `Rejected` < `Applied` < `OA` < `Phone Screen` < `Onsite` < `Offer`) → a `kind: "status_update"` suggestion.
   - Matched an existing company, no status advance, but `key_info` present → a `kind: "note_only"` suggestion (notes are suggested regardless of confidence, same as the old auto-append behavior — they're just gated behind approval now instead of applying instantly).
   - Everything else (status not advanced, low confidence, no match, no info) → informational skip, `review_status: "none"`, nothing to approve.
   - A suggestion's `note`, if present, rides along with whatever else that suggestion does — approving a `status_update` also appends its note in the same action, it isn't a separate approval step.
   - Gemini's snake_case `status_update` is translated to RecruitLens's `PipelineStatus` via `STATUS_MAP`. `"technical"` has no dedicated stage and folds into `"Onsite"`.
7. **Log.** Every processed email produces an `AgentLogEntry`, prepended to the existing log (newest first), capped at 300 entries, persisted to `localStorage` (`email_agent_log`).

**Known limitation:** because nothing is applied during the sync itself, `companies` is a fixed snapshot for the whole of phase 2 — if two emails in the same sync both concern a company that doesn't exist yet, you'll get two separate `new_company` suggestions for it rather than one being merged into the other. Reject the duplicate when reviewing. Same applies if two emails in one sync both propose advancing the same existing company to different stages — both suggestions target the *current* stored status independently, so approve the one that's actually further along and reject/ignore the other.

## Review & approval (`SuggestionReview.tsx`, `useEmailAgent.ts`)

- `pendingSuggestions` (computed in `App.tsx` as `agentLog.filter(e => e.review_status === "pending")`) drives the review queue UI.
- **`approveSuggestion(entry, store)`** — calls `applyPendingChange`, which performs the actual `addCompany`/`updateRoleField`/`appendRoleNote` call(s) against the live store based on `entry.pending.kind`, then rewrites `action_taken` to describe what actually happened (e.g. `"Suggested: Stripe Applied → OA"` becomes `"Updated status: Applied → OA"`) and sets `review_status: "approved"`. This rewrite is deliberate — it's what lets `RecentUpdates` and `undoStatusUpdate` keep working unchanged on approved entries, since they match on the exact `"Updated status: X → Y"` string.
- **`rejectSuggestion(entry)`** — no pipeline mutation, just sets `review_status: "rejected"` and appends `" [rejected]"` to `action_taken` (mirrors how `undoStatusUpdate` marks entries `" [undone]"`).
- **`approveAllPending(store)` / `rejectAllPending()`** — same logic applied to every currently-pending entry in the log.
- Approving a `new_company` suggestion whose company already got created by an earlier approval in the same sync isn't specially handled — see the duplicate-suggestion limitation above.

## Undo

`undoStatusUpdate(logEntry, store)` — regex-parses `"Updated status: X → Y"` out of the log entry's `action_taken` (only present after that suggestion has been approved), writes the role's status back to `X`, and appends `" [undone]"` so it can't be undone twice. Only works on approved status-update entries with a `company_id`; no-ops otherwise. Surfaced as an "Undo" button on the 5 most recent approved updates in the panel (`RecentUpdates`).

## localStorage keys

| Key | Holds |
|---|---|
| `gmail_access_token` / `gmail_token_expiry` | OAuth token + expiry timestamp |
| `email_agent_log` | Array of `AgentLogEntry`, newest first, capped at 300 — dedup source, audit trail, **and** the approval queue (entries with `review_status: "pending"` and a `pending` payload). Surviving in the same store as the log is what makes pending suggestions persist across a page refresh with no extra plumbing. |

Pipeline data itself (`companies`) is **not** persisted anywhere — it's `usePipelineStore`'s in-memory state, seeded from `mockCompanies.ts`. A page refresh loses every approved pipeline edit; only the log (including anything still pending) and the Gmail token survive.

## History / known constraints

- **Model:** tried `gemini-2.0-flash` (now retired — API returns "model no longer available") and `gemini-2.5-flash-lite` (only 20 requests/day on the dev key). Settled on `gemini-3.1-flash-lite` for the best free-tier quota available (15 RPM / 500 RPD). If quota errors reappear, check the model first — this key's per-model daily caps vary enormously.
- **Rate limiting:** a client-side token-bucket limiter + retry-on-429 was built into `gemini.ts` at one point, then explicitly removed. There is currently no throttling — batching (see above) is what actually keeps request counts low now.
- **Batching:** currently active (`BATCH_SIZE = 10`). Was tried, reverted to one-call-per-email, then re-added — if it gets reverted again, the single-email version is `analyzeRecruitingEmail` in git history.
- **Search breadth:** the keyword list has been broadened twice (once to catch rejection/offer phrasing that doesn't say "reject"/"offer", once to catch assessment-platform invites) and narrowed once (to stop catching generic assessment-campaign mail). Current state is the broadened version.
- **Auto-apply → approval queue:** the agent originally mutated the pipeline directly during sync. This was replaced with the approve/reject flow documented above — nothing happens to the pipeline without an explicit user action now.
