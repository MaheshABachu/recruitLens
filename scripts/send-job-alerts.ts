// Emails users new postings that match their job-alert preferences
// (communicationPlan.md). Runs as a step of .github/workflows/sync-jobs.yml
// right after the postings import, so it sees new rows as soon as they land:
// `npm run send:alerts`.
//
// Each run:
//   1. Picks up postings first seen since the last finished run (alert_runs
//      watermark). The very first run only records a watermark, so nothing
//      already on the board is ever emailed. Postings whose date_posted is
//      more than MAX_POSTING_AGE_DAYS old are ignored (a newly added source
//      would otherwise backfill hundreds).
//   2. Matches them against every user with email on and app access
//      (alert_recipients(); src/lib/alertMatching.ts) and queues an
//      alert_deliveries row per match. The unique key means a posting is
//      never queued twice for a user.
//   3. Sends: instant users get one email per kind with everything queued;
//      daily users get one digest per kind during 9am in their timezone.
//      Queued rows older than STALE_DAYS (access ended, alerts turned off)
//      are marked skipped instead.
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY. Without
// RESEND_API_KEY it does nothing (so the workflow is safe before it's set).
//
// --dry-run: read-only. Matches postings first seen in the last 24 hours (or
// --since=<hours>) and prints who would get what, writing the first email to
// --preview=<file.html> if given. Sends and writes nothing.

import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { LEGAL } from "../src/lib/legal";
import type { AlertCategory, AlertFrequency, AlertPreferences } from "../src/lib/alerts";
import { matchPosting, type AlertMatch, type AlertPosting, type AlertPostingKind, type AlertProfile } from "../src/lib/alertMatching";
import { buildAlertEmail, matchReason, type EmailPosting } from "./alert-email";

config({ path: ".env.local" });

const MAX_POSTING_AGE_DAYS = 3;
const STALE_DAYS = 3;
const DIGEST_HOUR = 9;
// Resend's default limit is 2 requests/second.
const SEND_GAP_MS = 600;

const SENDERS: Record<AlertPostingKind, string> = {
  internships: "Vantage Internship Alerts <internshipalerts@vantageprep.dev>",
  jobs: "Vantage Job Alerts <jobalerts@vantageprep.dev>",
};
const TABLE: Record<AlertPostingKind, string> = { jobs: "job_postings", internships: "internship_postings" };
const KINDS: AlertPostingKind[] = ["internships", "jobs"];

const POSTING_COLUMNS =
  "id, company, title, location, url, salary, category, is_faang, no_sponsorship, requires_us_citizenship, date_posted, first_seen_at, is_active, is_closed";

interface PostingRow {
  id: string;
  company: string;
  title: string;
  location: string | null;
  url: string;
  salary: string | null;
  category: string | null;
  is_faang: boolean;
  no_sponsorship: boolean;
  requires_us_citizenship: boolean;
  date_posted: string | null;
  first_seen_at: string;
  is_active: boolean;
  is_closed: boolean;
}

interface PrefsRow {
  user_id: string;
  wants_jobs: boolean;
  wants_internships: boolean;
  categories: string[];
  title_keywords: string[];
  locations: string[];
  needs_sponsorship: boolean;
  any_faang: boolean;
  email_enabled: boolean;
  frequency: AlertFrequency;
  timezone: string | null;
  unsubscribe_token: string;
}

interface Recipient {
  userId: string;
  email: string;
  prefs: PrefsRow;
  profile: AlertProfile;
}

interface DeliveryRow {
  id: string;
  user_id: string;
  posting_kind: AlertPostingKind;
  posting_id: string;
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SINCE_HOURS = Number(args.find((a) => a.startsWith("--since="))?.split("=")[1] ?? 24);
const PREVIEW_FILE = args.find((a) => a.startsWith("--preview="))?.split("=")[1];

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (!RESEND_API_KEY && !DRY_RUN) {
  console.log("RESEND_API_KEY isn't set; skipping job alerts.");
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const SITE = LEGAL.siteUrl;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

function hourIn(timeZone: string | null, now: Date): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timeZone ?? "America/Chicago" }).format(now),
    );
  } catch {
    return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Chicago" }).format(now));
  }
}

function toPreferences(r: PrefsRow): AlertPreferences {
  return {
    wantsJobs: r.wants_jobs,
    wantsInternships: r.wants_internships,
    categories: r.categories as AlertCategory[],
    titleKeywords: r.title_keywords,
    locations: r.locations,
    needsSponsorship: r.needs_sponsorship,
    anyFaang: r.any_faang,
    emailEnabled: r.email_enabled,
    frequency: r.frequency,
  };
}

async function loadRecipients(): Promise<Recipient[]> {
  const rows = must(
    await supabase.rpc("alert_recipients"),
    "alert_recipients",
  ) as { user_id: string; email: string; has_access: boolean }[];
  const live = rows.filter((r) => r.has_access);
  if (live.length === 0) return [];
  const ids = live.map((r) => r.user_id);

  const prefs = must(
    await supabase.from("alert_preferences").select("*").in("user_id", ids),
    "alert_preferences",
  ) as PrefsRow[];
  const companies = must(
    await supabase.from("alert_companies").select("user_id, name_key").in("user_id", ids),
    "alert_companies",
  ) as { user_id: string; name_key: string }[];

  const keysByUser = new Map<string, Set<string>>();
  for (const c of companies) {
    if (!keysByUser.has(c.user_id)) keysByUser.set(c.user_id, new Set());
    keysByUser.get(c.user_id)!.add(c.name_key);
  }
  const prefsByUser = new Map(prefs.map((p) => [p.user_id, p]));

  return live.flatMap((r) => {
    const p = prefsByUser.get(r.user_id);
    if (!p) return [];
    return [{
      userId: r.user_id,
      email: r.email,
      prefs: p,
      profile: { preferences: toPreferences(p), companyKeys: keysByUser.get(r.user_id) ?? new Set() },
    }];
  });
}

async function loadNewPostings(kind: AlertPostingKind, since: string): Promise<PostingRow[]> {
  return must(
    await supabase
      .from(TABLE[kind])
      .select(POSTING_COLUMNS)
      .gt("first_seen_at", since)
      .order("first_seen_at")
      .limit(5000),
    `${TABLE[kind]} since ${since}`,
  ) as PostingRow[];
}

function isFresh(p: PostingRow, now: Date) {
  if (!p.is_active || p.is_closed) return false;
  if (!p.date_posted) return true;
  const ageDays = (now.getTime() - new Date(`${p.date_posted}T00:00:00Z`).getTime()) / 86_400_000;
  return ageDays <= MAX_POSTING_AGE_DAYS;
}

function asAlertPosting(kind: AlertPostingKind, p: PostingRow): AlertPosting {
  return {
    kind,
    company: p.company,
    title: p.title,
    location: p.location,
    category: p.category,
    is_faang: p.is_faang,
    no_sponsorship: p.no_sponsorship,
    requires_us_citizenship: p.requires_us_citizenship,
  };
}

interface Ranked {
  posting: PostingRow;
  match: AlertMatch;
}

// The postings this user's alert takes, best match first (newest first on ties).
function rank(r: Recipient, kind: AlertPostingKind, postings: PostingRow[]): Ranked[] {
  return postings
    .flatMap((posting) => {
      const match = matchPosting(r.profile, asAlertPosting(kind, posting));
      return match ? [{ posting, match }] : [];
    })
    .sort((a, b) => b.match.score - a.match.score || b.posting.first_seen_at.localeCompare(a.posting.first_seen_at));
}

function asEmailPosting({ posting: p, match }: Ranked): EmailPosting {
  return { company: p.company, title: p.title, location: p.location, salary: p.salary, url: p.url, match };
}

function emailFor(r: Recipient, kind: AlertPostingKind, digest: boolean, ranked: Ranked[]) {
  return buildAlertEmail({
    kind,
    digest,
    postings: ranked.map(asEmailPosting),
    manageUrl: `${SITE}/?alerts=1`,
    unsubscribeUrl: `${SITE}/unsubscribe?token=${r.prefs.unsubscribe_token}`,
    boardUrl: SITE,
  });
}

async function sendEmail(to: string, kind: AlertPostingKind, unsubscribeToken: string, idempotencyKey: string, email: ReturnType<typeof buildAlertEmail>) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: SENDERS[kind],
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: {
        // One-click unsubscribe (RFC 8058): mail clients POST to this URL.
        "List-Unsubscribe": `<${SUPABASE_URL}/functions/v1/alerts-unsubscribe?token=${unsubscribeToken}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// ---------------------------------------------------------------------------

async function dryRun() {
  const now = new Date();
  const since = new Date(now.getTime() - SINCE_HOURS * 3_600_000).toISOString();
  const recipients = await loadRecipients();
  console.log(`Dry run: postings first seen since ${since}; ${recipients.length} recipient(s) with email on and access.`);

  let previewWritten = false;
  for (const kind of KINDS) {
    const postings = (await loadNewPostings(kind, since)).filter((p) => isFresh(p, now));
    console.log(`\n${kind}: ${postings.length} new posting(s) within ${MAX_POSTING_AGE_DAYS} days of posting.`);
    for (const r of recipients) {
      const matched = rank(r, kind, postings);
      if (matched.length === 0) continue;
      const email = emailFor(r, kind, r.prefs.frequency === "daily", matched);
      console.log(`  ${r.email} (${r.prefs.frequency}): ${matched.length} match(es). Subject: "${email.subject}"`);
      for (const { posting: p, match } of matched.slice(0, 8)) {
        console.log(`    - ${p.company}: ${p.title} [${p.location ?? "?"}] (${matchReason(match) || "role"})`);
      }
      if (PREVIEW_FILE && !previewWritten) {
        writeFileSync(PREVIEW_FILE, email.html);
        console.log(`    (email preview written to ${PREVIEW_FILE})`);
        previewWritten = true;
      }
    }
  }
}

async function run() {
  const now = new Date();
  const runRow = must(
    await supabase.from("alert_runs").insert({}).select("id, started_at").single(),
    "start alert run",
  ) as { id: string; started_at: string };

  let matched = 0;
  let sent = 0;
  try {
    const last = must(
      await supabase
        .from("alert_runs")
        .select("watermark")
        .not("finished_at", "is", null)
        .is("error", null)
        .not("watermark", "is", null)
        .order("started_at", { ascending: false })
        .limit(1),
      "last alert run",
    ) as { watermark: string }[];

    // First run ever: start counting from now.
    const since = last[0]?.watermark ?? runRow.started_at;
    let watermark = since;

    const recipients = await loadRecipients();
    const byUser = new Map(recipients.map((r) => [r.userId, r]));

    // 1-2. Match new postings and queue deliveries.
    for (const kind of KINDS) {
      const postings = await loadNewPostings(kind, since);
      for (const p of postings) if (p.first_seen_at > watermark) watermark = p.first_seen_at;
      const fresh = postings.filter((p) => isFresh(p, now));

      const queue = recipients.flatMap((r) =>
        fresh
          .filter((p) => matchPosting(r.profile, asAlertPosting(kind, p)) !== null)
          .map((p) => ({ user_id: r.userId, posting_kind: kind, posting_id: p.id, channel: "email", status: "queued" })),
      );
      matched += queue.length;
      for (const rows of chunk(queue, 500)) {
        must(
          await supabase
            .from("alert_deliveries")
            .upsert(rows, { onConflict: "user_id,posting_kind,posting_id,channel", ignoreDuplicates: true }),
          "queue deliveries",
        );
      }
      console.log(`${kind}: ${postings.length} new, ${fresh.length} fresh, ${queue.length} match(es) queued.`);
    }

    // 3a. Drop what has waited too long (access ended, alerts off, failed lookups).
    must(
      await supabase
        .from("alert_deliveries")
        .update({ status: "skipped", error: "stale" })
        .eq("status", "queued")
        .lt("created_at", new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString()),
      "expire stale deliveries",
    );

    // 3b. Send.
    const queued = must(
      await supabase
        .from("alert_deliveries")
        .select("id, user_id, posting_kind, posting_id")
        .eq("status", "queued")
        .in("user_id", recipients.length ? recipients.map((r) => r.userId) : ["00000000-0000-0000-0000-000000000000"])
        .limit(10000),
      "queued deliveries",
    ) as DeliveryRow[];

    // Daily users: only during their digest hour, and once a day.
    const recentlySent = new Set<string>();
    const dailyIds = recipients.filter((r) => r.prefs.frequency === "daily").map((r) => r.userId);
    if (dailyIds.length > 0) {
      const recent = must(
        await supabase
          .from("alert_deliveries")
          .select("user_id")
          .eq("status", "sent")
          .in("user_id", dailyIds)
          .gt("sent_at", new Date(now.getTime() - 20 * 3_600_000).toISOString()),
        "recent digests",
      ) as { user_id: string }[];
      for (const r of recent) recentlySent.add(r.user_id);
    }

    const groups = new Map<string, DeliveryRow[]>();
    for (const d of queued) {
      const key = `${d.user_id}|${d.posting_kind}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }

    for (const [key, deliveries] of groups) {
      const [userId, kind] = key.split("|") as [string, AlertPostingKind];
      const r = byUser.get(userId);
      if (!r) continue;
      const digest = r.prefs.frequency === "daily";
      if (digest && (hourIn(r.prefs.timezone, now) !== DIGEST_HOUR || recentlySent.has(userId))) continue;

      // Re-read the postings: some may have closed since they were queued.
      const postings = must(
        await supabase.from(TABLE[kind]).select(POSTING_COLUMNS).in("id", deliveries.map((d) => d.posting_id)),
        "queued postings",
      ) as PostingRow[];
      // Re-rank against current preferences too: they may have changed since queueing.
      const ordered = rank(r, kind, postings.filter((p) => p.is_active && !p.is_closed));
      const keep = new Set(ordered.map((x) => x.posting.id));
      const toSend = deliveries.filter((d) => keep.has(d.posting_id));
      const gone = deliveries.filter((d) => !keep.has(d.posting_id));
      if (gone.length > 0) {
        must(
          await supabase
            .from("alert_deliveries")
            .update({ status: "skipped", error: "closed or no longer matches" })
            .in("id", gone.map((d) => d.id)),
          "skip closed",
        );
      }
      if (toSend.length === 0) continue;

      const emailId = randomUUID();
      const email = emailFor(r, kind, digest, ordered);
      const ids = toSend.map((d) => d.id);
      try {
        await sendEmail(r.email, kind, r.prefs.unsubscribe_token, emailId, email);
        must(
          await supabase
            .from("alert_deliveries")
            .update({ status: "sent", sent_at: new Date().toISOString(), digest_id: emailId })
            .in("id", ids),
          "mark sent",
        );
        sent += ids.length;
        console.log(`Sent ${kind} ${digest ? "digest" : "alert"} (${ids.length}) to user ${userId}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to send to user ${userId}: ${message}`);
        must(
          await supabase.from("alert_deliveries").update({ status: "failed", error: message.slice(0, 500), digest_id: emailId }).in("id", ids),
          "mark failed",
        );
      }
      await sleep(SEND_GAP_MS);
    }

    must(
      await supabase
        .from("alert_runs")
        .update({ finished_at: new Date().toISOString(), watermark, matched, sent })
        .eq("id", runRow.id),
      "finish alert run",
    );
    console.log(`Done: ${matched} queued, ${sent} posting(s) emailed. Watermark ${watermark}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("alert_runs")
      .update({ finished_at: new Date().toISOString(), error: message.slice(0, 1000), matched, sent })
      .eq("id", runRow.id);
    throw err;
  }
}

(DRY_RUN ? dryRun() : run()).catch((err) => {
  console.error(err);
  process.exit(1);
});
