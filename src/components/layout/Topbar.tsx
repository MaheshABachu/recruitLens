import { ThemeToggle } from "./ThemeToggle";
import { SettingsButton } from "./SettingsButton";
import { EmailAgentButton } from "../email/EmailAgentButton";

interface TopbarProps {
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  isEmailConnected: boolean;
  isEmailSyncing: boolean;
  onOpenEmailAgent: () => void;
  onOpenSettings: () => void;
}

export function Topbar({
  isDrawerOpen,
  onToggleDrawer,
  isEmailConnected,
  isEmailSyncing,
  onOpenEmailAgent,
  onOpenSettings,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <button
          type="button"
          className="hamburger"
          onClick={onToggleDrawer}
          aria-label={isDrawerOpen ? "Close company list" : "Open company list"}
          aria-expanded={isDrawerOpen}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="logo">
          <span className="logo__mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="logo__text">
            Recruit<span className="logo__accent">Lens</span>
          </span>
        </div>
      </div>
      <div className="topbar__right">
        <EmailAgentButton
          isConnected={isEmailConnected}
          isSyncing={isEmailSyncing}
          onClick={onOpenEmailAgent}
        />
        <SettingsButton onClick={onOpenSettings} />
        <ThemeToggle />
      </div>
    </header>
  );
}
