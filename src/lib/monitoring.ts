import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

// Vercel Web Analytics + Speed Insights (cookieless; turn both on in the
// Vercel project's dashboard, otherwise their scripts 404 harmlessly). Only
// in production builds so local dev doesn't report.
//
// Sentry error monitoring loads only when VITE_SENTRY_DSN is set (also in the
// hosting provider's env), as its own chunk so it costs nothing otherwise.
export function startMonitoring() {
  if (!import.meta.env.PROD) return;
  inject();
  injectSpeedInsights();

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (dsn) {
    void import("@sentry/react").then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        // Errors only; no performance tracing or session replay.
        tracesSampleRate: 0,
      });
    });
  }
}
