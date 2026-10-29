import { ThemeToggle } from "./ThemeToggle";
import { SettingsButton } from "./SettingsButton";
import { Logo } from "../shared/Logo";

interface TopbarProps {
  onOpenSettings: () => void;
  userEmail?: string | null;
  onSignOut: () => void;
}

export function Topbar({ onOpenSettings, userEmail, onSignOut }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <Logo size={20} />
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
