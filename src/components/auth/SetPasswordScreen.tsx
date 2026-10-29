import { ThemeToggle } from "../layout/ThemeToggle";
import { Logo } from "../shared/Logo";
import { AuthForm } from "./AuthForm";

// Shown by App.tsx after the user follows a password-reset email link
// (AuthContext.passwordRecovery), until they save a new password.
export function SetPasswordScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="landing auth-screen">
      <header className="landing__nav">
        <Logo />
        <div className="landing__nav-actions">
          <ThemeToggle />
          <button type="button" className="landing-btn landing-btn--ghost" onClick={onSignOut}>
            Cancel
          </button>
        </div>
      </header>
      <main className="auth-screen__body">
        <div className="auth-screen__card">
          <AuthForm mode="update-password" />
        </div>
      </main>
    </div>
  );
}
