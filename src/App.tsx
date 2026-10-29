import { useState } from "react";
import { Topbar } from "./components/layout/Topbar";
import { JobsBoard } from "./components/jobs/JobsBoard";
import { CompaniesBoard } from "./components/companies/CompaniesBoard";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { LoginScreen } from "./components/auth/LoginScreen";
import { useLeetCodeSync } from "./hooks/useLeetCodeSync";
import { useAuth } from "./hooks/useAuth";

type Tab = "Company Questions" | "Jobs";
const TABS: Tab[] = ["Company Questions", "Jobs"];

export default function App() {
  const { session, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Company Questions");
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const userId = session?.user.id ?? null;

  const {
    status: leetCodeStatus,
    username: leetCodeUsername,
    stats: leetCodeStats,
    lastSyncedAt: leetCodeLastSyncedAt,
    error: leetCodeError,
    connect: connectLeetCode,
    resync: resyncLeetCode,
  } = useLeetCodeSync(userId);

  if (authLoading) return null;
  if (!session) return <LoginScreen />;

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

      {activeTab === "Company Questions" && <CompaniesBoard />}

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
        />
      )}
    </div>
  );
}
