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

export async function analyzeRecruitingEmail(
  subject: string,
  sender: string,
  body: string,
  knownCompanies: { name: string }[],
): Promise<EmailAnalysisResult | null> {
  const companyList = knownCompanies.map((c) => c.name).join(", ");

  const prompt = `You are analyzing a recruiting email to extract structured data.

Known companies in the user's pipeline: ${companyList}

Email subject: ${subject}
Email sender: ${sender}
Email body (first 1500 chars): ${body.slice(0, 1500)}

CRITICAL RULE — Job board platform emails:
Emails sent by LinkedIn, Indeed, Handshake, Glassdoor, ZipRecruiter, Lever, Greenhouse, Workday, or any other job platform are NOT from the company itself. The sender domain (e.g. linkedin.com, indeed.com) is the platform, not the employer. In these cases you MUST extract the actual hiring company from the email subject or body.
Examples:
- Subject "Mahesh, your application was sent to Stripe" -> company_name = "Stripe"
- Subject "Your application to Google has been reviewed" -> company_name = "Google"
- Subject "Mahesh, your application was sent to CodeGeniusRecruit" -> company_name = "CodeGeniusRecruit"
- Body "Thank you for applying to Citadel through LinkedIn" -> company_name = "Citadel"
Never set company_name to "LinkedIn", "Indeed", "Handshake", or any other job platform name.

Return ONLY a JSON object with exactly these fields, no other text, no markdown:
{
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
Set confidence "high" only if you are certain about both the company match and the status.`;

  const system = "Return only valid JSON. No markdown, no explanation, no code fences.";

  try {
    const raw = await callGemini(prompt, system);
    const clean = raw.replace(/```json\n?|```/g, "").trim();
    return JSON.parse(clean) as EmailAnalysisResult;
  } catch (err) {
    console.error("analyzeRecruitingEmail failed:", err);
    return null;
  }
}
