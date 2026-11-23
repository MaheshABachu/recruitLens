// Emails free-trial users as their trial runs out: "ends in 2 days",
// "ends tomorrow", "ends today", each with a link to the plan picker
// (/?plans=1). Runs as a step of .github/workflows/sync-jobs.yml every 30
// minutes: `npm run send:trial-reminders`.
//
// Recipients: accounts younger than FREE_TRIAL_DAYS with no live subscription
// (trial_reminder_recipients()). Each run sends a user only the reminder for
// the window they're in now, once (trial_reminders). A missed window is
// skipped, not sent late, so nobody gets two at once.
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY. Without
// RESEND_API_KEY it does nothing.
//
// --dry-run: read-only. Prints who would get which reminder now, writing the
// first email to --preview=<file.html> if given.

import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { LEGAL } from "../src/lib/legal";
import { FREE_TRIAL_DAYS } from "../src/lib/plans";
import { buildTrialEmail, type TrialStage } from "./trial-email";

config({ path: ".env.local" });

const HOUR_MS = 3_600_000;
const FROM = "Vantage <hello@vantageprep.dev>";
const DEFAULT_TIMEZONE = "America/Chicago";
// Resend's default limit is 2 requests/second.
const SEND_GAP_MS = 600;

// Hours left on the trial → which reminder that window gets.
function stageFor(hoursLeft: number): TrialStage | null {
  if (hoursLeft <= 0) return null;
  if (hoursLeft <= 8) return "today";
  if (hoursLeft <= 24) return "1_day";
  if (hoursLeft <= 48) return "2_days";
  return null;
}

interface RecipientRow {
  user_id: string;
  email: string;
  created_at: string;
  timezone: string | null;
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PREVIEW_FILE = args.find((a) => a.startsWith("--preview="))?.split("=")[1];

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

function emailFor(r: RecipientRow, stage: TrialStage, end: Date, now: Date) {
  const tz = validZone(r.timezone);
  return buildTrialEmail({
    stage,
    endsAtLabel: endsAtLabel(end, tz),
    endsToday: localDate(end, tz) === localDate(now, tz),
    plansUrl: PLANS_URL,
  });
}

async function sendEmail(to: string, idempotencyKey: string, email: ReturnType<typeof buildTrialEmail>) {
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

async function main() {
  const now = new Date();
  const { data, error } = await supabase.rpc("trial_reminder_recipients");
  if (error) throw new Error(`trial_reminder_recipients: ${error.message}`);
  const rows = (data ?? []) as RecipientRow[];

  const due = rows.flatMap((r) => {
    const end = new Date(new Date(r.created_at).getTime() + FREE_TRIAL_DAYS * 24 * HOUR_MS);
    const stage = stageFor((end.getTime() - now.getTime()) / HOUR_MS);
    return stage ? [{ r, end, stage }] : [];
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
  console.log(`${rows.length} user(s) in trial; ${todo.length} reminder(s) due.`);

  let previewWritten = false;
  let sentCount = 0;
  for (const { r, end, stage } of todo) {
    const email = emailFor(r, stage, end, now);
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
