// HTML + plain-text bodies for job-alert emails (scripts/send-job-alerts.ts).
// Table layout with inline styles, since email clients ignore most CSS.
//
// Postings arrive best match first (src/lib/alertMatching.ts). Title-keyword
// matches get their own section at the top; everything else follows. Each
// posting says why it was sent.

import { LEGAL } from "../src/lib/legal";
import type { AlertMatch, AlertPostingKind } from "../src/lib/alertMatching";
import { FREQUENCY_HOURS, type AlertFrequency } from "../src/lib/alertFrequency";

export const MAX_POSTINGS_PER_EMAIL = 10;

export interface EmailPosting {
  company: string;
  title: string;
  location: string | null;
  salary: string | null;
  url: string;
  match: AlertMatch | null;
}

export interface AlertEmailInput {
  kind: AlertPostingKind;
  // 24h is the daily digest; 4h/6h/12h batch the last few hours.
  frequency: AlertFrequency;
  // Best match first.
  postings: EmailPosting[];
  manageUrl: string;
  unsubscribeUrl: string;
  boardUrl: string;
}

export interface AlertEmail {
  subject: string;
  html: string;
  text: string;
}

const NOUN: Record<AlertPostingKind, [string, string]> = {
  internships: ["internship", "internships"],
  jobs: ["new-grad role", "new-grad roles"],
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function plural(n: number, kind: AlertPostingKind) {
  return `${n} ${NOUN[kind][n === 1 ? 0 : 1]}`;
}

function listPhrase(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items[0]}, ${items[1]} and more`;
}

// "On your companies list · In SF Bay Area · Title matches “Power”"
export function matchReason(m: AlertMatch | null): string {
  if (!m) return "";
  const parts: string[] = [];
  if (m.keywords.length > 0) parts.push(`Title matches ${m.keywords.map((k) => `“${k}”`).join(", ")}`);
  if (m.company === "listed") parts.push("On your companies list");
  else if (m.company === "faang") parts.push("FAANG+");
  if (m.location) parts.push(`In ${m.location}`);
  return parts.join(" · ");
}

const hasKeywords = (p: EmailPosting) => (p.match?.keywords.length ?? 0) > 0;

export function buildAlertEmail(input: AlertEmailInput): AlertEmail {
  const { kind, frequency, postings } = input;
  const digest = frequency === "24h";
  const total = postings.length;
  const shown = postings.slice(0, MAX_POSTINGS_PER_EMAIL);
  const more = total - shown.length;
  const top = shown.filter(hasKeywords);
  const rest = shown.filter((p) => !hasKeywords(p));
  const matchedKeywords = [...new Set(postings.flatMap((p) => p.match?.keywords ?? []))];

  const lead = postings[0];
  const subject = digest
    ? `Your daily digest: ${plural(total, kind)} for you`
    : hasKeywords(lead)
      ? `${lead.title} at ${lead.company}${total > 1 ? ` + ${total - 1} more` : ""}`
      : total === 1
        ? `New at ${lead.company}: ${lead.title}`
        : `${plural(total, kind)} at ${listPhrase([...new Set(postings.map((p) => p.company))])}`;

  const heading = digest
    ? `${plural(total, kind)} matched your alerts today`
    : frequency === "30m"
      ? `${plural(total, kind)} just posted`
      : `${plural(total, kind)} posted in the last ${FREQUENCY_HOURS[frequency]} hours`;

  const meta = (p: EmailPosting) => [p.location, p.salary].filter(Boolean).join(" · ");

  const row = (p: EmailPosting) => {
    const why = matchReason(p.match);
    return `
        <tr>
          <td style="padding:16px 0;border-top:1px solid #e1ddd0;">
            <div style="font-size:13px;font-weight:600;color:#6b6b66;">${esc(p.company)}</div>
            <div style="margin-top:2px;font-size:16px;font-weight:650;color:#17181a;line-height:1.35;">${esc(p.title)}</div>
            ${meta(p) ? `<div style="margin-top:4px;font-size:13px;color:#6b6b66;">${esc(meta(p))}</div>` : ""}
            ${why ? `<div style="margin-top:6px;font-size:12px;color:#3563d6;">${esc(why)}</div>` : ""}
            <a href="${esc(p.url)}" style="display:inline-block;margin-top:10px;font-size:14px;font-weight:600;color:#17181a;">Apply &rarr;</a>
          </td>
        </tr>`;
  };

  const sectionTitle = (title: string) =>
    `<tr><td style="padding:20px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9c978a;">${esc(title)}</td></tr>`;

  const keywordTitle = `Matches your keywords: ${matchedKeywords.join(", ")}`;
  const restTitle = rest.some((p) => p.match?.company || p.match?.location)
    ? "More at your companies and locations"
    : "More for you";

  const rows = top.length > 0
    ? sectionTitle(keywordTitle) + top.map(row).join("") + (rest.length > 0 ? sectionTitle(restTitle) + rest.map(row).join("") : "")
    : shown.map(row).join("");

  const moreRow = more > 0
    ? `<tr><td style="padding:16px 0;border-top:1px solid #e1ddd0;font-size:14px;color:#6b6b66;">And ${plural(more, kind)} more on Vantage.</td></tr>`
    : "";

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f2f0e6;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f0e6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 16px;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#17181a;">Vantage</td></tr>
        <tr><td style="padding:28px;background:#ffffff;border:1px solid #e1ddd0;border-radius:14px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:750;letter-spacing:-0.02em;color:#17181a;">${esc(heading)}</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${moreRow}</table>
          <a href="${esc(input.boardUrl)}" style="display:inline-block;margin-top:12px;padding:11px 18px;border-radius:10px;background:#1c1d1b;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">See all on Vantage</a>
        </td></tr>
        <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:#9c978a;">
          You're getting this because you turned on job alerts at Vantage.
          <a href="${esc(input.manageUrl)}" style="color:#6b6b66;">Manage alerts</a> &middot;
          <a href="${esc(input.unsubscribeUrl)}" style="color:#6b6b66;">Unsubscribe</a><br>
          Replies to this address aren't read.<br>
          ${esc(LEGAL.serviceName)} &middot; ${esc(LEGAL.postalAddress)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textRow = (p: EmailPosting) => {
    const why = matchReason(p.match);
    return [`${p.company}: ${p.title}`, ...(meta(p) ? [meta(p)] : []), ...(why ? [why] : []), `Apply: ${p.url}`, ""];
  };
  const textRows = top.length > 0
    ? [keywordTitle.toUpperCase(), "", ...top.flatMap(textRow), ...(rest.length > 0 ? [restTitle.toUpperCase(), "", ...rest.flatMap(textRow)] : [])]
    : shown.flatMap(textRow);

  const text = [
    heading,
    "",
    ...textRows,
    ...(more > 0 ? [`And ${plural(more, kind)} more on Vantage.`, ""] : []),
    `See all on Vantage: ${input.boardUrl}`,
    "",
    "---",
    "You're getting this because you turned on job alerts at Vantage.",
    `Manage alerts: ${input.manageUrl}`,
    `Unsubscribe: ${input.unsubscribeUrl}`,
    "Replies to this address aren't read.",
    `${LEGAL.serviceName} · ${LEGAL.postalAddress}`,
  ].join("\n");

  return { subject, html, text };
}
