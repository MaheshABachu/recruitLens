import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

// Vercel Web Analytics + Speed Insights (cookieless; enabled in the Vercel
// project's dashboard). Only in production builds so local dev doesn't report.
export function startMonitoring() {
  if (!import.meta.env.PROD) return;
  inject();
  injectSpeedInsights();
}
