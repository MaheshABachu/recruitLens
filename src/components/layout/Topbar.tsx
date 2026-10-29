import { ThemeToggle } from "./ThemeToggle";
import { SettingsButton } from "./SettingsButton";

interface TopbarProps {
  onOpenSettings: () => void;
  userEmail?: string | null;
  onSignOut: () => void;
}

export function Topbar({ onOpenSettings, userEmail, onSignOut }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="logo">
          <span className="logo__mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="logo__text">
            Van<span className="logo__accent">tage</span>
          </span>
        </div>
      </div>
      <div className="topbar__right">
        <SettingsButton onClick={onOpenSettings} />
        <ThemeToggle />
        {userEmail && (
          <>
            <span className="topbar__divider" aria-hidden="true" />
            <button type="button" className="account-btn" onClick={onSignOut} title={userEmail}>
              {userEmail[0]?.toUpperCase()}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
