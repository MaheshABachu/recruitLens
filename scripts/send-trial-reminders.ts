// Emails free-trial users as their trial runs out: "ends in 2 days",
// "ends tomorrow", "ends today", then, once the trial has ended without a
// subscription, "Miss your job notifs?" once a day for two days, each with a
// link to the plan picker (/?plans=1). Runs as a step of
// .github/workflows/sync-jobs.yml every 30 minutes:
// `npm run send:trial-reminders`.
//
// Recipients: accounts younger than FREE_TRIAL_DAYS + 2 days with no live
// subscription or comp access (trial_reminder_recipients()). Each run sends a
// user only the email for the window they're in now, once (trial_reminders).
// A missed window is skipped, not sent late, so nobody gets two at once. The
// after-trial emails wait for daytime (9am-9pm) in the user's timezone; each
// window is 24 hours, so that always comes.
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY. Without
// RESEND_API_KEY it does nothing.
//
// --dry-run: read-only. Prints who would get which reminder now, writing the
// first email to --preview=<file.html> if given. --sample=<stage> instead
// writes that stage's email (made-up recipient, real posting counts) to
// --preview, for checking the template.

import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { LEGAL } from "../src/lib/legal";
import { FREE_TRIAL_DAYS } from "../src/lib/plans";
import {
  buildTrialEmail,
  buildTrialEndedEmail,
  type TrialEmail,
  type TrialEndedStage,
  type TrialStage,
} from "./trial-email";

config({ path: ".env.local" });

const HOUR_MS = 3_600_000;
const FROM = "Vantage <hello@vantageprep.dev>";
const DEFAULT_TIMEZONE = "America/Chicago";
// Resend's default limit is 2 requests/second.
const SEND_GAP_MS = 600;
// After-trial emails go out between these local hours (end exclusive).
const DAYTIME = [9, 21] as const;

type Stage = TrialStage | TrialEndedStage;

// Hours left on the trial (negative once it's over) → which email that window gets.
function stageFor(hoursLeft: number): Stage | null {
  if (hoursLeft > 48) return null;
  if (hoursLeft > 24) return "2_days";
  if (hoursLeft > 8) return "1_day";
  if (hoursLeft > 0) return "today";
  if (hoursLeft > -24) return "ended_day_1";
  if (hoursLeft > -48) return "ended_day_2";
  return null;
}

const isEnded = (stage: Stage): stage is TrialEndedStage => stage === "ended_day_1" || stage === "ended_day_2";

interface RecipientRow {
  user_id: string;
  email: string;
  created_at: string;
  timezone: string | null;
  alerts_on: boolean;
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PREVIEW_FILE = args.find((a) => a.startsWith("--preview="))?.split("=")[1];
const SAMPLE_STAGE = args.find((a) => a.startsWith("--sample="))?.split("=")[1] as Stage | undefined;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}
if (!RESEND_API_KEY && !DRY_RUN) {
  console.log("RESEND_API_KEY isn't set; skipping trial reminders.");
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const PLANS_URL = `${LEGAL.siteUrl}/?plans=1`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function validZone(tz: string | null): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function localDate(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// "Thursday, Nov 26 at 3:42 PM CST"
function endsAtLabel(end: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" }).format(end);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(end);
  return `${day} at ${time}`;
}

function localHour(d: Date, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(d));
}

// Active postings first seen since the trial ended, per board. Cached per
// end hour so a batch of users doesn't repeat the same counts.
const countCache = new Map<string, Promise<{ jobs: number; internships: number }>>();
function postingsSince(end: Date) {
  const since = new Date(Math.floor(end.getTime() / HOUR_MS) * HOUR_MS).toISOString();
  let cached = countCache.get(since);
  if (!cached) {
    const count = async (table: string) => {
      const { count: n, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .gt("first_seen_at", since);
      if (error) throw new Error(`${table} count: ${error.message}`);
      return n ?? 0;
    };
    cached = Promise.all([count("job_postings"), count("internship_postings")]).then(([jobs, internships]) => ({
      jobs,
      internships,
    }));
    countCache.set(since, cached);
  }
  return cached;
}

async function emailFor(r: RecipientRow, stage: Stage, end: Date, now: Date): Promise<TrialEmail> {
  const tz = validZone(r.timezone);
  if (isEnded(stage)) {
    const missed = await postingsSince(end);
    return buildTrialEndedEmail({
      stage,
      newJobs: missed.jobs,
      newInternships: missed.internships,
      alertsOn: r.alerts_on,
      plansUrl: PLANS_URL,
    });
  }
  return buildTrialEmail({
    stage,
    endsAtLabel: endsAtLabel(end, tz),
    endsToday: localDate(end, tz) === localDate(now, tz),
    plansUrl: PLANS_URL,
  });
}

async function sendEmail(to: string, idempotencyKey: string, email: TrialEmail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: LEGAL.contactEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// --dry-run --sample=<stage> --preview=<file>: render one stage for a made-up
// recipient whose trial ended (or ends) relative to now.
async function writeSample(stage: Stage, file: string) {
  const now = new Date();
  const offsetHours: Record<Stage, number> = {
    "2_days": 40,
    "1_day": 20,
    today: 5,
    ended_day_1: -20,
    ended_day_2: -44,
  };
  const end = new Date(now.getTime() + offsetHours[stage] * HOUR_MS);
  const sample: RecipientRow = { user_id: "sample", email: "you@example.com", created_at: "", timezone: null, alerts_on: true };
  const email = await emailFor(sample, stage, end, now);
  writeFileSync(file, email.html);
  console.log(`Sample ${stage}: "${email.subject}" written to ${file}.`);
  console.log(`\n${email.text}`);
}

async function main() {
  if (SAMPLE_STAGE) {
    if (!DRY_RUN || !PREVIEW_FILE) throw new Error("--sample needs --dry-run and --preview=<file.html>.");
    if (!["2_days", "1_day", "today", "ended_day_1", "ended_day_2"].includes(SAMPLE_STAGE)) {
      throw new Error(`Unknown --sample stage: ${SAMPLE_STAGE}`);
    }
    return writeSample(SAMPLE_STAGE, PREVIEW_FILE);
  }
  const now = new Date();
  const { data, error } = await supabase.rpc("trial_reminder_recipients");
  if (error) throw new Error(`trial_reminder_recipients: ${error.message}`);
  const rows = (data ?? []) as RecipientRow[];

  const due = rows.flatMap((r) => {
    const end = new Date(new Date(r.created_at).getTime() + FREE_TRIAL_DAYS * 24 * HOUR_MS);
    const stage = stageFor((end.getTime() - now.getTime()) / HOUR_MS);
    if (!stage) return [];
    if (isEnded(stage)) {
      const hour = localHour(now, validZone(r.timezone));
      if (hour < DAYTIME[0] || hour >= DAYTIME[1]) return [];
    }
    return [{ r, end, stage }];
  });

  const sentKeys = new Set<string>();
  if (due.length > 0) {
    const { data: sent, error: sentError } = await supabase
      .from("trial_reminders")
      .select("user_id, stage")
      .in("user_id", due.map((d) => d.r.user_id));
    if (sentError) throw new Error(`trial_reminders: ${sentError.message}`);
    for (const s of sent ?? []) sentKeys.add(`${s.user_id}|${s.stage}`);
  }
  const todo = due.filter((d) => !sentKeys.has(`${d.r.user_id}|${d.stage}`));
  console.log(`${rows.length} user(s) in or just past the trial; ${todo.length} email(s) due.`);

  let previewWritten = false;
  let sentCount = 0;
  for (const { r, end, stage } of todo) {
    const email = await emailFor(r, stage, end, now);
    if (DRY_RUN) {
      console.log(`  ${r.email}: ${stage} — "${email.subject}"`);
      if (PREVIEW_FILE && !previewWritten) {
        writeFileSync(PREVIEW_FILE, email.html);
        console.log(`  (email preview written to ${PREVIEW_FILE})`);
        previewWritten = true;
      }
      continue;
    }

    // Claim the stage first so a crash mid-send can't produce a duplicate on
    // the next run; un-claim it if Resend rejects the email.
    const { error: claimError } = await supabase.from("trial_reminders").insert({ user_id: r.user_id, stage });
    if (claimError) {
      // 23505: another run already claimed it.
      if (claimError.code !== "23505") console.error(`Couldn't record ${stage} for user ${r.user_id}: ${claimError.message}`);
      continue;
    }
    try {
      await sendEmail(r.email, `trial-${r.user_id}-${stage}`, email);
      sentCount++;
      console.log(`Sent ${stage} reminder to user ${r.user_id}.`);
    } catch (err) {
      console.error(`Failed to send ${stage} to user ${r.user_id}: ${err instanceof Error ? err.message : String(err)}`);
      await supabase.from("trial_reminders").delete().eq("user_id", r.user_id).eq("stage", stage);
    }
    await sleep(SEND_GAP_MS);
  }
  if (!DRY_RUN) console.log(`Done: ${sentCount} reminder(s) sent.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
