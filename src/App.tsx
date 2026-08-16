import { useEffect, useState } from "react";
import { Topbar } from "./components/layout/Topbar";
import { Sidebar } from "./components/pipeline/Sidebar";
import { CompanyDetail } from "./components/pipeline/CompanyDetail";
import { EmailAgentPanel } from "./components/email/EmailAgentPanel";
import { usePipelineStore } from "./hooks/usePipelineStore";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useEmailAgent } from "./hooks/useEmailAgent";

type Tab = "Pipeline" | "Practice" | "AI Coach" | "Resume";
const TABS: Tab[] = ["Pipeline", "Practice", "AI Coach", "Resume"];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Pipeline");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isEmailPanelOpen, setIsEmailPanelOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 720px)");

  const {
    companies,
    activeCompany,
    activeRole,
    activeRoleIndex,
    selectCompany,
    selectRole,
    togglePriority,
    addCompany,
    updateRoleField,
    appendRoleNote,
  } = usePipelineStore();

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
  } = useEmailAgent();

  const emailAgentStore = { companies, addCompany, updateRoleField, appendRoleNote };
  const pendingSuggestions = agentLog.filter((e) => e.review_status === "pending");

  // Auto-close the drawer if the viewport grows past the mobile breakpoint.
  useEffect(() => {
    if (!isMobile) setIsDrawerOpen(false);
  }, [isMobile]);

  return (
    <div className="app">
      <Topbar
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen((v) => !v)}
        isEmailConnected={isEmailConnected}
        isEmailSyncing={emailSyncing}
        onOpenEmailAgent={() => setIsEmailPanelOpen(true)}
      />

      <nav className="tab-bar" aria-label="Sections">
        {TABS.map((tab) => {
          const isPipeline = tab === "Pipeline";
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              className={`tab-bar__tab ${isActive ? "tab-bar__tab--active" : ""} ${
                !isPipeline ? "tab-bar__tab--disabled" : ""
              }`}
              onClick={isPipeline ? () => setActiveTab(tab) : undefined}
              disabled={!isPipeline}
              aria-disabled={!isPipeline}
              aria-current={isActive ? "true" : undefined}
            >
              {tab}
              {!isPipeline && <span className="tab-bar__soon">Soon</span>}
            </button>
          );
        })}
      </nav>

      <div className="app__body">
        <Sidebar
          companies={companies}
          activeCompanyId={activeCompany?.id ?? null}
          onSelectCompany={selectCompany}
          isDrawerOpen={isDrawerOpen}
          onCloseDrawer={() => setIsDrawerOpen(false)}
        />
        <CompanyDetail
          company={activeCompany}
          activeRole={activeRole}
          activeRoleIndex={activeRoleIndex}
          onSelectRole={selectRole}
          onTogglePriority={togglePriority}
        />
      </div>

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
    </div>
  );
}
