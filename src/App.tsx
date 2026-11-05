import { useState } from "react";
import { Topbar } from "./components/layout/Topbar";
import { JobsBoard } from "./components/jobs/JobsBoard";
import { CompaniesBoard } from "./components/companies/CompaniesBoard";
import { LandingPage } from "./components/landing/LandingPage";
import { Paywall } from "./components/billing/Paywall";
import { SetPasswordScreen } from "./components/auth/SetPasswordScreen";
import { OnboardingTour } from "./components/onboarding/OnboardingTour";
import { useLeetCodeSync } from "./hooks/useLeetCodeSync";
import { useOnboarding } from "./hooks/useOnboarding";
import { useAuth } from "./hooks/useAuth";
import { useSubscription } from "./hooks/useSubscription";
import { BILLING_ENABLED } from "./lib/billing";

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

  const billing = useSubscription(BILLING_ENABLED ? userId : null);
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

  if (authLoading) return null;
  if (!session) return <LandingPage />;
  if (passwordRecovery) return <SetPasswordScreen onSignOut={signOut} />;
  if (isLockedOut) {
    if (billing.loading && !billing.confirmingCheckout) return null;
    return (
      <Paywall
        subscription={billing.subscription}
        confirmingCheckout={billing.confirmingCheckout}
        userEmail={session.user.email}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="app">
      <Topbar
        userEmail={session.user.email}
        onSignOut={signOut}
        subscription={BILLING_ENABLED ? billing.subscription : undefined}
        onStartTour={startTour}
      />

      <OnboardingTour active={onboarding.showTour} onDone={onboarding.finishTour} onShowTab={setActiveTab} />

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

      {activeTab === "Company Questions" && (
        <CompaniesBoard leetCode={leetCode} selected={selectedCompany} onSelect={setSelectedCompany} />
      )}

      {activeTab === "Jobs" && <JobsBoard key="jobs" kind="jobs" title="Jobs" onPrepCompany={prepCompany} />}

      {activeTab === "Internships" && (
        <JobsBoard key="internships" kind="internships" title="Internships" onPrepCompany={prepCompany} />
      )}
    </div>
  );
}
