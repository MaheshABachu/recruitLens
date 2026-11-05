import { lazy, Suspense, useEffect, useState } from "react";
import { Topbar } from "./components/layout/Topbar";
import { useLeetCodeSync } from "./hooks/useLeetCodeSync";
import { prefetchJobPostings } from "./hooks/useJobPostings";
import { useOnboarding } from "./hooks/useOnboarding";
import { useAuth } from "./hooks/useAuth";
import { useSubscription } from "./hooks/useSubscription";
import { BILLING_ENABLED } from "./lib/billing";

// Each screen is its own chunk: signed-out visitors don't download the app,
// signed-in users don't download the landing page, and recharts / driver.js
// load only with the views that use them.
const LandingPage = lazy(() => import("./components/landing/LandingPage").then((m) => ({ default: m.LandingPage })));
const Paywall = lazy(() => import("./components/billing/Paywall").then((m) => ({ default: m.Paywall })));
const SetPasswordScreen = lazy(() =>
  import("./components/auth/SetPasswordScreen").then((m) => ({ default: m.SetPasswordScreen })),
);
const loadCompaniesBoard = () => import("./components/companies/CompaniesBoard");
const loadJobsBoard = () => import("./components/jobs/JobsBoard");
const CompaniesBoard = lazy(() => loadCompaniesBoard().then((m) => ({ default: m.CompaniesBoard })));
const JobsBoard = lazy(() => loadJobsBoard().then((m) => ({ default: m.JobsBoard })));
// Returning visitors usually have a stored session: start downloading the
// default tab's code now instead of after auth resolves.
try {
  if (Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))) void loadCompaniesBoard();
} catch {
  // Storage blocked — the board just loads after auth.
}

const OnboardingTour = lazy(() =>
  import("./components/onboarding/OnboardingTour").then((m) => ({ default: m.OnboardingTour })),
);

// Once the app is idle, warm the other tabs (their code and postings) so
// switching to them doesn't wait on the network.
function whenIdle(fn: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 1500);
  return () => clearTimeout(id);
}

type Tab = "Company Questions" | "Jobs" | "Internships";
const TABS: Tab[] = ["Company Questions", "Jobs", "Internships"];

export default function App() {
  const { session, loading: authLoading, passwordRecovery, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Company Questions");
  // The company picked on the Company Questions tab. Lives here so the Jobs
  // and Internships tabs can jump straight to a company's questions.
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  function prepCompany(company: string) {
    setSelectedCompany(company);
    setActiveTab("Company Questions");
  }

  const billing = useSubscription(BILLING_ENABLED ? userId : null, session?.user.created_at);
  // Plan picker opened from the account menu during the free trial.
  const [choosingPlan, setChoosingPlan] = useState(false);
  const isLockedOut = BILLING_ENABLED && !billing.hasAccess;

  const pendingLeetCodeUsername =
    typeof session?.user.user_metadata?.leetcode_username === "string"
      ? session.user.user_metadata.leetcode_username
      : null;
  const leetCode = useLeetCodeSync(isLockedOut ? null : userId, pendingLeetCodeUsername);
  const onboarding = useOnboarding(isLockedOut || passwordRecovery ? null : userId);

  // The tour points at the Company Questions landing view, so replaying it
  // from another tab (or with a company open) goes back there first.
  function startTour() {
    setActiveTab("Company Questions");
    setSelectedCompany(null);
    onboarding.startTour();
  }

  const appVisible = !!session && !passwordRecovery && !isLockedOut;
  useEffect(() => {
    if (!appVisible) return;
    return whenIdle(() => {
      void loadCompaniesBoard();
      void loadJobsBoard();
      void import("./components/shared/RadarChart");
      prefetchJobPostings("internships");
      prefetchJobPostings("jobs");
    });
  }, [appVisible]);

  if (authLoading) return null;
  if (!session) {
    return (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    );
  }
  if (passwordRecovery) {
    return (
      <Suspense fallback={null}>
        <SetPasswordScreen onSignOut={signOut} />
      </Suspense>
    );
  }
  if (isLockedOut) {
    if (billing.loading && !billing.confirmingCheckout) return null;
    return (
      <Suspense fallback={null}>
        <Paywall
          subscription={billing.subscription}
          confirmingCheckout={billing.confirmingCheckout}
          userEmail={session.user.email}
          onSignOut={signOut}
        />
      </Suspense>
    );
  }
  if (BILLING_ENABLED && choosingPlan && billing.inFreeTrial) {
    return (
      <Suspense fallback={null}>
        <Paywall
          subscription={billing.subscription}
          confirmingCheckout={false}
          userEmail={session.user.email}
          onSignOut={signOut}
          onClose={() => setChoosingPlan(false)}
          trialEnd={billing.trialEnd}
        />
      </Suspense>
    );
  }

  return (
    <div className="app">
      <Topbar
        userEmail={session.user.email}
        onSignOut={signOut}
        subscription={BILLING_ENABLED ? billing.subscription : undefined}
        trialEnd={billing.inFreeTrial ? billing.trialEnd : null}
        onChoosePlan={BILLING_ENABLED && billing.inFreeTrial ? () => setChoosingPlan(true) : undefined}
        onStartTour={startTour}
      />

      {onboarding.showTour && (
        <Suspense fallback={null}>
          <OnboardingTour active onDone={onboarding.finishTour} onShowTab={setActiveTab} />
        </Suspense>
      )}

      <nav className="tab-bar" aria-label="Sections" data-tour="tabs">
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              className={`tab-bar__tab ${isActive ? "tab-bar__tab--active" : ""}`}
              onClick={() => setActiveTab(tab)}
              aria-current={isActive ? "true" : undefined}
            >
              {tab}
            </button>
          );
        })}
      </nav>

      <Suspense fallback={null}>
        {activeTab === "Company Questions" && (
          <CompaniesBoard leetCode={leetCode} selected={selectedCompany} onSelect={setSelectedCompany} />
        )}

        {activeTab === "Jobs" && <JobsBoard key="jobs" kind="jobs" title="Jobs" onPrepCompany={prepCompany} />}

        {activeTab === "Internships" && (
          <JobsBoard key="internships" kind="internships" title="Internships" onPrepCompany={prepCompany} />
        )}
      </Suspense>
    </div>
  );
}
