import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/landing.css";
import { legalDocForPath } from "./lib/legal";
import { startMonitoring } from "./lib/monitoring";

startMonitoring();

// /terms, /privacy and /unsubscribe render on their own, signed in or out (no
// router; vercel.json rewrites these paths to index.html).
const LegalPage = lazy(() => import("./components/legal/LegalPage").then((m) => ({ default: m.LegalPage })));
const UnsubscribePage = lazy(() =>
  import("./components/alerts/UnsubscribePage").then((m) => ({ default: m.UnsubscribePage })),
);
const legalDoc = legalDocForPath(window.location.pathname);
const isUnsubscribe = window.location.pathname.replace(/\/+$/, "") === "/unsubscribe";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {legalDoc ? (
        <Suspense fallback={null}>
          <LegalPage doc={legalDoc} />
        </Suspense>
      ) : isUnsubscribe ? (
        <Suspense fallback={null}>
          <UnsubscribePage />
        </Suspense>
      ) : (
        <AuthProvider>
          <App />
        </AuthProvider>
      )}
    </ThemeProvider>
  </StrictMode>,
);
