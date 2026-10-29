import { useState } from "react";
import { Topbar } from "./components/layout/Topbar";
import { JobsBoard } from "./components/jobs/JobsBoard";
import { CompaniesBoard } from "./components/companies/CompaniesBoard";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { LandingPage } from "./components/landing/LandingPage";
import { Paywall } from "./components/billing/Paywall";
import { useLeetCodeSync } from "./hooks/useLeetCodeSync";
import { useAuth } from "./hooks/useAuth";
import { useSubscription } from "./hooks/useSubscription";
import { BILLING_ENABLED } from "./lib/billing";

type Tab = "Company Questions" | "Jobs";
const TABS: Tab[] = ["Company Questions", "Jobs"];

export default function App() {
  const { session, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Company Questions");
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const userId = session?.user.id ?? null;

  const billing = useSubscription(BILLING_ENABLED ? userId : null);
  const isLockedOut = BILLING_ENABLED && !billing.hasAccess;

  const {
    status: leetCodeStatus,
    username: leetCodeUsername,
    stats: leetCodeStats,
    lastSyncedAt: leetCodeLastSyncedAt,
    lastChangedAt: leetCodeLastChangedAt,
    error: leetCodeError,
    connect: connectLeetCode,
    resync: resyncLeetCode,
  } = useLeetCodeSync(isLockedOut ? null : userId);

  if (authLoading) return null;
  if (!session) return <LandingPage />;
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
        onOpenSettings={() => setIsSettingsPanelOpen(true)}
        userEmail={session.user.email}
        onSignOut={signOut}
      />

      <nav className="tab-bar" aria-label="Sections">
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

      {activeTab === "Company Questions" && <CompaniesBoard solvedVersion={leetCodeLastChangedAt} />}

      {activeTab === "Jobs" && <JobsBoard />}

      {isSettingsPanelOpen && (
        <SettingsPanel
          onClose={() => setIsSettingsPanelOpen(false)}
          leetCodeStatus={leetCodeStatus}
          leetCodeUsername={leetCodeUsername}
          leetCodeStats={leetCodeStats}
          leetCodeLastSyncedAt={leetCodeLastSyncedAt}
          leetCodeError={leetCodeError}
          onConnectLeetCode={connectLeetCode}
          onResyncLeetCode={resyncLeetCode}
          subscription={BILLING_ENABLED ? billing.subscription : undefined}
        />
      )}
    </div>
  );
}
