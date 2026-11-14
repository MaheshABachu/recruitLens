// Facts the Terms of Service and Privacy Policy (src/components/legal/)
// depend on. These are drafts, not legal advice: have them reviewed, and
// update LAST_UPDATED whenever either document changes.
export const LEGAL = {
  serviceName: "Vantage",
  siteUrl: "https://www.vantageprep.dev",
  // Who operates the service (the business name on Stripe receipts).
  operator: "Mahesh Bachu",
  // Must be a monitored inbox before launch.
  contactEmail: "support@vantageprep.dev",
  governingLaw: "the State of Texas",
  // Physical address required in every alert email's footer (CAN-SPAM).
  postalAddress: "800 W 26th Street, Austin, TX 78705",
  lastUpdated: "November 14, 2026",
};

export type LegalDoc = "terms" | "privacy";

export function legalDocForPath(pathname: string): LegalDoc | null {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/terms") return "terms";
  if (path === "/privacy") return "privacy";
  return null;
}
