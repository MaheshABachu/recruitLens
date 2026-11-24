// HTML + plain-text bodies for trial-ending reminders and the two "trial
// ended" follow-ups (scripts/send-trial-reminders.ts). Same look as
// scripts/alert-email.ts.

import { LEGAL } from "../src/lib/legal";
import { CHARITY, DONATION_SHARE, PLANS, formatPerMonth, planSavingsPercent } from "../src/lib/plans";

export type TrialStage = "2_days" | "1_day" | "today";

export interface TrialEmailInput {
  stage: TrialStage;
  // "Thursday, Nov 26 at 3:42 PM CST"
  endsAtLabel: string;
  // True when the trial ends on the reader's current calendar day.
  endsToday: boolean;
  plansUrl: string;
}

export interface TrialEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function when(input: TrialEmailInput) {
  if (input.stage === "2_days") return "in 2 days";
  if (input.stage === "1_day") return "tomorrow";
  return input.endsToday ? "today" : "in a few hours";
}

export function buildTrialEmail(input: TrialEmailInput): TrialEmail {
  const w = when(input);
  const subject = `Your Vantage free trial ends ${w}`;
  const heading = input.stage === "today" ? `Last call: your trial ends ${w}` : `Your free trial ends ${w}`;
  const intro = `Your Vantage free trial ends ${input.endsAtLabel}. Pick a plan to keep everything you've set up:`;
  const keeps = [
    "Company-tagged LeetCode questions for hundreds of companies",
    "The new-grad job and internship boards, updated every 30 minutes",
    "Job alert emails for the roles, companies and locations you picked",
  ];
  const after = "After that, the boards and question lists lock until you subscribe. Your account, LeetCode progress and settings stay put.";
  const donation = `${Math.round(DONATION_SHARE * 100)}% of what you pay goes to ${CHARITY.name}.`;

  const planLine = (p: (typeof PLANS)[number]) => {
    const savings = planSavingsPercent(p);
    return `${p.label}: $${p.price} ${p.period}${p.months > 1 ? ` (${formatPerMonth(p)}${savings > 0 ? `, save ${savings}%` : ""})` : ""}`;
  };

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f2f0e6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0e6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 16px;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#17181a;">Vantage</td></tr>
        <tr><td style="padding:28px;background:#ffffff;border:1px solid #e1ddd0;border-radius:14px;color:#17181a;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:750;letter-spacing:-0.02em;">${esc(heading)}</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${esc(intro)}</p>
          <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;">
            ${keeps.map((k) => `<li>${esc(k)}</li>`).join("")}
          </ul>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#6b6b66;">${esc(after)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            ${PLANS.map((p) => `<tr><td style="padding:10px 0;border-top:1px solid #e1ddd0;font-size:15px;">${esc(planLine(p))}</td></tr>`).join("")}
          </table>
          <a href="${esc(input.plansUrl)}" style="display:inline-block;padding:11px 18px;border-radius:10px;background:#1c1d1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Choose a plan</a>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#6b6b66;">${esc(donation)}</p>
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:#9c978a;">
          You're getting this because you started a free trial at Vantage. We send three of these before it ends and two after, then stop.<br>
          Questions? Write to <a href="mailto:${esc(LEGAL.contactEmail)}" style="color:#6b6b66;">${esc(LEGAL.contactEmail)}</a>.<br>
          ${esc(LEGAL.serviceName)} &middot; ${esc(LEGAL.postalAddress)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    heading,
    "",
    intro,
    ...keeps.map((k) => `- ${k}`),
    "",
    after,
    "",
    ...PLANS.map(planLine),
    "",
    `Choose a plan: ${input.plansUrl}`,
    "",
    donation,
    "",
    "---",
    "You're getting this because you started a free trial at Vantage. We send three of these before it ends and two after, then stop.",
    `Questions? Write to ${LEGAL.contactEmail}.`,
    `${LEGAL.serviceName} · ${LEGAL.postalAddress}`,
  ].join("\n");

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// After the trial: one email a day for two days.

export type TrialEndedStage = "ended_day_1" | "ended_day_2";

export interface TrialEndedEmailInput {
  stage: TrialEndedStage;
  // Postings first seen since the trial ended (0 = don't mention).
  newJobs: number;
  newInternships: number;
  // Had job-alert emails on during the trial.
  alertsOn: boolean;
  plansUrl: string;
}

export function buildTrialEndedEmail(input: TrialEndedEmailInput): TrialEmail {
  const site = LEGAL.siteUrl.replace(/^https?:\/\/(www\.)?/, "");
  const lastOne = input.stage === "ended_day_2";
  const subject = lastOne
    ? `Still missing your job notifs? Sign up again at ${site}`
    : `Miss your job notifs? Sign up again at ${site}`;
  const heading = "Miss your job notifs?";

  const total = input.newJobs + input.newInternships;
  const parts = [
    input.newInternships > 0 ? `${input.newInternships.toLocaleString("en-US")} internship${input.newInternships === 1 ? "" : "s"}` : "",
    input.newJobs > 0 ? `${input.newJobs.toLocaleString("en-US")} new-grad role${input.newJobs === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const missed =
    total > 0
      ? `Since your free trial ended, ${parts.join(" and ")} ${total === 1 ? "has" : "have"} been posted on Vantage.`
      : "Your Vantage free trial has ended.";
  const paused = input.alertsOn
    ? "Your job alert emails are paused, so you won't hear about new roles at the companies and places you picked."
    : "The job boards, alert emails and company question lists are locked until you sign up again.";
  const keep = "Your account, LeetCode progress and alert settings are all still here. Pick a plan and everything turns back on right away.";
  const cheapest = [...PLANS].sort((a, b) => a.price / a.months - b.price / b.months)[0];
  const priceLine = `From ${formatPerMonth(cheapest)} on the ${cheapest.label.toLowerCase()} plan. ${Math.round(DONATION_SHARE * 100)}% goes to ${CHARITY.name}.`;
  const cta = `Sign up again at ${site}`;
  const footer = lastOne
    ? "This is our last email about your trial. We won't send more."
    : "Your free trial at Vantage ended. We'll send one more of these tomorrow, then stop.";

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f2f0e6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0e6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 16px;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#17181a;">Vantage</td></tr>
        <tr><td style="padding:28px;background:#ffffff;border:1px solid #e1ddd0;border-radius:14px;color:#17181a;">
          <h1 style="margin:0 0 12px;font-size:24px;font-weight:750;letter-spacing:-0.02em;">${esc(heading)}</h1>
          ${
            total > 0
              ? `<div style="margin:0 0 16px;padding:16px 18px;border-radius:12px;background:#eef2fc;">
            <div style="font-size:32px;font-weight:800;letter-spacing:-0.03em;color:#3563d6;line-height:1.1;">${total.toLocaleString("en-US")}</div>
            <div style="margin-top:2px;font-size:14px;color:#3563d6;font-weight:600;">new roles posted since your trial ended</div>
          </div>`
              : ""
          }
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${esc(missed)}</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${esc(paused)}</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.55;color:#6b6b66;">${esc(keep)}</p>
          <a href="${esc(input.plansUrl)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#1c1d1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${esc(cta)}</a>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:#6b6b66;">${esc(priceLine)}</p>
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:#9c978a;">
          ${esc(footer)}<br>
          Questions? Write to <a href="mailto:${esc(LEGAL.contactEmail)}" style="color:#6b6b66;">${esc(LEGAL.contactEmail)}</a>.<br>
          ${esc(LEGAL.serviceName)} &middot; ${esc(LEGAL.postalAddress)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    heading,
    "",
    missed,
    paused,
    "",
    keep,
    "",
    `${cta}: ${input.plansUrl}`,
    "",
    priceLine,
    "",
    "---",
    footer,
    `Questions? Write to ${LEGAL.contactEmail}.`,
    `${LEGAL.serviceName} · ${LEGAL.postalAddress}`,
  ].join("\n");

  return { subject, html, text };
}
