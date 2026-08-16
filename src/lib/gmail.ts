// Gmail read-only scan via Google Identity Services (OAuth popup, no redirect).
// Ported from interview-os's src/lib/gmail.js.

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_KEY = "gmail_access_token";
const EXPIRY_KEY = "gmail_token_expiry";
const REFRESH_SLACK = 5 * 60 * 1000; // refresh 5 minutes before actual expiry

export interface GmailMessageRef {
  id: string;
  threadId: string;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

// Dynamically load the Google Identity Services library once
let _gisReady: Promise<void> | null = null;
function loadGIS(): Promise<void> {
  if (_gisReady) return _gisReady;
  _gisReady = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
  return _gisReady;
}

function saveToken(resp: GisTokenResponse) {
  localStorage.setItem(TOKEN_KEY, resp.access_token!);
  // expires_in is in seconds (typically 3600 = 1 hour)
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + (resp.expires_in ?? 3600) * 1000));
}

// Attempt a silent token refresh — no popup shown if Google session is active.
// Throws 'GMAIL_UNAUTHORIZED' if the user's Google session has fully expired.
function silentRefresh(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return Promise.reject(new Error("GMAIL_UNAUTHORIZED"));
  return loadGIS().then(
    () =>
      new Promise<string>((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GMAIL_SCOPE,
          prompt: "", // empty = silent, no popup if already authorized
          callback: (resp: GisTokenResponse) => {
            if (resp.error || !resp.access_token) {
              reject(new Error("GMAIL_UNAUTHORIZED"));
              return;
            }
            saveToken(resp);
            resolve(resp.access_token);
          },
        });
        client.requestAccessToken({ prompt: "" });
      }),
  );
}

// Returns a guaranteed-fresh token, silently refreshing if the current one
// is expired or within REFRESH_SLACK of expiry. Call this before every API request.
export async function ensureFreshToken(): Promise<string> {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || "0", 10);
  if (token && Date.now() < expiry - REFRESH_SLACK) return token;
  // Token missing or about to expire — refresh silently
  return silentRefresh();
}

// Opens a Google OAuth popup (no redirect) and calls onToken(accessToken) on success.
// Requires VITE_GOOGLE_CLIENT_ID in .env and http://localhost:5173 in
// Google Cloud Console -> OAuth client -> Authorized JavaScript origins.
export async function initiateGoogleAuth(onToken: (token: string) => void): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID is not set in .env");
  await loadGIS();
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GMAIL_SCOPE,
    callback: (resp: GisTokenResponse) => {
      if (resp.error) {
        console.error("GIS error:", resp);
        return;
      }
      if (resp.access_token) {
        saveToken(resp);
        onToken(resp.access_token);
      }
    },
  });
  client.requestAccessToken();
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export async function fetchRecruitingEmails(accessToken: string): Promise<GmailMessageRef[]> {
  // Not restricted to subject: — Gemini re-classifies is_recruiting_email per
  // message anyway, so this is a coarse net, not the real filter. Broad on
  // purpose to avoid missing things whose subject line doesn't use any of the
  // narrower "applied/interview" terms — rejections and offers especially
  // rarely say "rejected" or "offer" outright, and cold recruiter outreach
  // has no "application" to reference yet. The from:(...) clause catches ATS
  // platform mail by sender domain regardless of subject wording.
  const KEYWORDS = [
    // application lifecycle
    "interview", "interviews", "application", "applications", "applying", "applied",
    "submitted", "candidacy", "candidate", "recruiter", "recruiting", "hiring",
    '"hiring team"',
    // assessments / screening
    "assessment", "assessments", "screening", '"coding challenge"', '"coding assessment"',
    '"take-home"', '"technical assessment"', '"phone screen"', '"phone interview"',
    // scheduling / logistics
    '"next steps"', '"select a time"', '"your availability"', '"interview confirmed"',
    '"schedule your interview"',
    // offers
    "offer", '"offer letter"', '"pleased to offer"', '"extend an offer"',
    '"welcome to the team"', "compensation",
    // rejections (rarely say "reject" outright)
    "rejection", "unfortunately", '"we regret"', '"thank you for your interest"',
    '"other candidates"', '"not moving forward"', '"position has been filled"',
    '"moving forward"',
    // cold outreach (no application exists yet)
    '"came across your profile"', '"exploring opportunities"', '"open role"',
    '"reaching out regarding"',
    // pre-employment
    '"background check"', '"reference check"', "onboarding", "invited",
  ].join(" OR ");

  const ATS_SENDERS = [
    "greenhouse.io", "lever.co", "myworkday.com", "icims.com", "smartrecruiters.com",
    "hirevue.com", "ashbyhq.com", "jobvite.com", "criteriacorp.com",
  ].join(" OR ");

  const q = encodeURIComponent(
    `category:primary newer_than:30d ((${KEYWORDS}) OR from:(${ATS_SENDERS}))`,
  );
  const res = await fetch(`${GMAIL_BASE}/messages?q=${q}&maxResults=75`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error("GMAIL_UNAUTHORIZED");
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`);
  const data = await res.json();
  return data.messages || [];
}

export async function fetchEmailContent(accessToken: string, messageId: string): Promise<any> {
  const res = await fetch(`${GMAIL_BASE}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new Error("GMAIL_UNAUTHORIZED");
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`);
  return res.json();
}

export function extractEmailBody(message: any): string {
  const payload = message.payload;
  if (!payload) return "";
  const parts = payload.parts || [];
  const textPart = parts.find((p: any) => p.mimeType === "text/plain");
  if (textPart?.body?.data) {
    return atob(textPart.body.data.replace(/-/g, "+").replace(/_/g, "/"));
  }
  if (payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
  }
  return "";
}

export function extractEmailHeaders(message: any): { subject: string; sender: string; date: string } {
  const headers = message.payload?.headers || [];
  const get = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  return { subject: get("Subject"), sender: get("From"), date: get("Date") };
}
