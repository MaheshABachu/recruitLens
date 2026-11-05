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

// /terms and /privacy render on their own, signed in or out (no router;
// vercel.json rewrites both paths to index.html).
const LegalPage = lazy(() => import("./components/legal/LegalPage").then((m) => ({ default: m.LegalPage })));
const legalDoc = legalDocForPath(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {legalDoc ? (
        <Suspense fallback={null}>
          <LegalPage doc={legalDoc} />
        </Suspense>
      ) : (
        <AuthProvider>
          <App />
        </AuthProvider>
      )}
    </ThemeProvider>
  </StrictMode>,
);
