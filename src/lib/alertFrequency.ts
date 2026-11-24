// How often job alerts are emailed (alert_preferences.frequency). No imports,
// so scripts/send-job-alerts.ts can use it under tsx.
//
// The sync runs about every 30 minutes, so "30m" sends whatever each run
// finds. 4h / 6h / 12h send at most once per interval, counted from the
// user's last alert email. 24h is the 9am-local daily digest.

export const ALERT_FREQUENCIES = ["30m", "4h", "6h", "12h", "24h"] as const;
export type AlertFrequency = (typeof ALERT_FREQUENCIES)[number];

export const FREQUENCY_HOURS: Record<AlertFrequency, number> = {
  "30m": 0.5,
  "4h": 4,
  "6h": 6,
  "12h": 12,
  "24h": 24,
};

// Short label for the picker segments.
export const FREQUENCY_LABEL: Record<AlertFrequency, string> = {
  "30m": "30 min",
  "4h": "4 hrs",
  "6h": "6 hrs",
  "12h": "12 hrs",
  "24h": "Daily",
};

// One line under the picker, and the account-menu status.
export const FREQUENCY_DETAIL: Record<AlertFrequency, string> = {
  "30m": "New matches within about 30 minutes of being posted.",
  "4h": "At most one email every 4 hours with everything new.",
  "6h": "At most one email every 6 hours with everything new.",
  "12h": "At most one email every 12 hours with everything new.",
  "24h": "One digest a day at 9am your time.",
};

export const FREQUENCY_STATUS: Record<AlertFrequency, string> = {
  "30m": "Every 30 min",
  "4h": "Every 4 hours",
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
  "24h": "Daily",
};

// Rows saved before the interval picker used 'instant' / 'daily' (the
// migration converts them; this guards an old cached value).
export function toAlertFrequency(value: string | null | undefined): AlertFrequency {
  if (value === "instant") return "30m";
  if (value === "daily") return "24h";
  return (ALERT_FREQUENCIES as readonly string[]).includes(value ?? "") ? (value as AlertFrequency) : "30m";
}
