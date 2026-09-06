import { useEffect, useState } from "react";
import { Topbar } from "./components/layout/Topbar";
import { Sidebar } from "./components/pipeline/Sidebar";
import { CompanyDetail } from "./components/pipeline/CompanyDetail";
import { EmailAgentPanel } from "./components/email/EmailAgentPanel";
import { JobsBoard } from "./components/jobs/JobsBoard";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { LoginScreen } from "./components/auth/LoginScreen";
import { usePipelineStore } from "./hooks/usePipelineStore";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useEmailAgent } from "./hooks/useEmailAgent";
import { useLeetCodeSync } from "./hooks/useLeetCodeSync";
import { useAuth } from "./hooks/useAuth";
import type { PipelineStatus } from "./types/pipeline";

type Tab = "Pipeline" | "Jobs";
const TABS: Tab[] = ["Pipeline", "Jobs"];

export default function App() {
  const { session, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Pipeline");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEmailPanelOpen, setIsEmailPanelOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 720px)");
  const userId = session?.user.id ?? null;

  const {
    companies,
    activeCompany,
    activeRole,
    activeRoleIndex,
    selectCompany,
    selectRole,
    togglePriority,
    addCompany,
    addRole,
    updateRoleField,
    deleteCompany,
    appendRoleNote,
  } = usePipelineStore(userId);

  function handleAddCompany(input: { name: string; role: string; status: PipelineStatus }) {
    const newCompany = addCompany(input);
    selectCompany(newCompany.id);
  }

  const {
    isAuthenticated: isEmailConnected,
    authenticate: authenticateEmail,
    disconnect: disconnectEmail,
    syncEmails,
    approveSuggestion,
    rejectSuggestion,
    approveAllPending,
    rejectAllPending,
    undoStatusUpdate,
    agentLog,
    syncing: emailSyncing,
    syncProgress: emailSyncProgress,
    lastSyncResult,
    syncError,
  } = useEmailAgent(userId);

  const emailAgentStore = { companies, addCompany, updateRoleField, appendRoleNote };
  const pendingSuggestions = agentLog.filter((e) => e.review_status === "pending");

  const {
    status: leetCodeStatus,
    username: leetCodeUsername,
    stats: leetCodeStats,
    lastSyncedAt: leetCodeLastSyncedAt,
    error: leetCodeError,
    connect: connectLeetCode,
    resync: resyncLeetCode,
  } = useLeetCodeSync(userId);

  // Auto-close the drawer if the viewport grows past the mobile breakpoint.
  useEffect(() => {
    if (!isMobile) setIsDrawerOpen(false);
  }, [isMobile]);

  if (authLoading) return null;
  if (!session) return <LoginScreen />;

  return (
    <div className="app">
      <Topbar
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen((v) => !v)}
        isEmailConnected={isEmailConnected}
        isEmailSyncing={emailSyncing}
        onOpenEmailAgent={() => setIsEmailPanelOpen(true)}
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

      {activeTab === "Pipeline" ? (
        <div className="app__body">
          <Sidebar
            companies={companies}
            activeCompanyId={activeCompany?.id ?? null}
            onSelectCompany={selectCompany}
            onAddCompany={handleAddCompany}
            isDrawerOpen={isDrawerOpen}
            onCloseDrawer={() => setIsDrawerOpen(false)}
          />
          <CompanyDetail
            company={activeCompany}
            activeRole={activeRole}
            activeRoleIndex={activeRoleIndex}
            onSelectRole={selectRole}
            onTogglePriority={togglePriority}
            onUpdateRoleField={updateRoleField}
            onAddRole={addRole}
            onDeleteCompany={deleteCompany}
          />
        </div>
      ) : (
        <JobsBoard />
      )}

      {isEmailPanelOpen && (
        <EmailAgentPanel
          onClose={() => setIsEmailPanelOpen(false)}
          isAuthenticated={isEmailConnected}
          authenticate={authenticateEmail}
          disconnect={disconnectEmail}
          syncing={emailSyncing}
          syncProgress={emailSyncProgress}
          lastSyncResult={lastSyncResult}
          syncError={syncError}
          onSync={() => syncEmails(emailAgentStore)}
          agentLog={agentLog}
          onUndo={(entry) => undoStatusUpdate(entry, emailAgentStore)}
          pendingSuggestions={pendingSuggestions}
          onApproveSuggestion={(entry) => approveSuggestion(entry, emailAgentStore)}
          onRejectSuggestion={rejectSuggestion}
          onApproveAllSuggestions={() => approveAllPending(emailAgentStore)}
          onRejectAllSuggestions={rejectAllPending}
        />
      )}

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
