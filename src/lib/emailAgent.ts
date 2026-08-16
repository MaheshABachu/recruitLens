// Parses a recruiting email into structured pipeline data via Gemini.
// Ported from interview-os's src/lib/emailAgent.js.

import { callGemini } from "./gemini";

export type EmailStatusUpdate =
  | "not_applied"
  | "applied"
  | "oa"
  | "phone_screen"
  | "technical"
  | "onsite"
  | "offer"
  | "rejected"
  | null;

export interface EmailAnalysisResult {
  company_name: string | null;
  is_recruiting_email: boolean;
  status_update: EmailStatusUpdate;
  key_info: string | null;
  confidence: "high" | "low";
}

export interface BatchEmailInput {
  subject: string;
  sender: string;
  body: string;
}

// Analyzes a batch of emails (up to BATCH_SIZE, set by the caller) in a
// single Gemini call instead of one call per email — cuts request count by
// ~10x on a large sync.
export async function analyzeRecruitingEmailsBatch(
  emails: BatchEmailInput[],
  knownCompanies: { name: string }[],
): Promise<(EmailAnalysisResult | null)[]> {
  const companyList = knownCompanies.map((c) => c.name).join(", ");

  const emailBlocks = emails
    .map(
      (e, i) => `--- EMAIL ${i} ---
Subject: ${e.subject}
Sender: ${e.sender}
Body: ${e.body}`,
    )
    .join("\n\n");

  const prompt = `You are analyzing a batch of ${emails.length} recruiting-related emails to extract structured data from EACH ONE INDEPENDENTLY.

Known companies in the user's pipeline: ${companyList}

${emailBlocks}

CRITICAL RULE — Job board platform emails:
Emails sent by LinkedIn, Indeed, Handshake, Glassdoor, ZipRecruiter, Lever, Greenhouse, Workday, or any other job platform are NOT from the company itself. The sender domain (e.g. linkedin.com, indeed.com) is the platform, not the employer. In these cases you MUST extract the actual hiring company from the email subject or body.
Examples:
- Subject "Mahesh, your application was sent to Stripe" -> company_name = "Stripe"
- Subject "Your application to Google has been reviewed" -> company_name = "Google"
- Subject "Mahesh, your application was sent to CodeGeniusRecruit" -> company_name = "CodeGeniusRecruit"
- Body "Thank you for applying to Citadel through LinkedIn" -> company_name = "Citadel"
Never set company_name to "LinkedIn", "Indeed", "Handshake", or any other job platform name.

Return ONLY a JSON array with exactly ${emails.length} objects — one per email, in the same order (EMAIL 0 first). No other text, no markdown. Each object:
{
  "index": <the EMAIL number, 0-based>,
  "company_name": "the actual hiring company (not the platform), or best guess, or null if not a recruiting email",
  "is_recruiting_email": true or false,
  "status_update": one of ["not_applied","applied","oa","phone_screen","technical","onsite","offer","rejected",null],
  "key_info": "one sentence summary of the most important info (deadline, next steps, interviewer, etc.) or null",
  "confidence": "high" or "low"
}

Only set status_update if the email clearly signals a stage change:
- Scheduling a phone screen -> "phone_screen"
- OA invite -> "oa"
- Onsite invite -> "onsite"
- Offer letter -> "offer"
- Rejection -> "rejected"
- Application acknowledgement (including LinkedIn "your application was sent") -> "applied"
- Generic recruiter outreach with no action -> null
Set confidence "high" only if you are certain about both the company match and the status for that specific email.`;

  const system = "Return only a valid JSON array. No markdown, no explanation, no code fences.";

  const empty = emails.map(() => null);

  try {
    const raw = await callGemini(prompt, system);
    const clean = raw.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(clean) as (EmailAnalysisResult & { index: number })[];
    if (!Array.isArray(parsed)) return empty;

    const results: (EmailAnalysisResult | null)[] = emails.map(() => null);
    for (const item of parsed) {
      if (typeof item.index === "number" && item.index >= 0 && item.index < emails.length) {
        results[item.index] = item;
      }
    }
    return results;
  } catch (err) {
    console.error("analyzeRecruitingEmailsBatch failed:", err);
    return empty;
  }
}
