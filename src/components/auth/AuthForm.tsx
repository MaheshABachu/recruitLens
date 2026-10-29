import { useId, useState, type FormEvent } from "react";
import { useAuth } from "../../hooks/useAuth";
import { GoogleIcon } from "../shared/GoogleIcon";

export type AuthMode = "sign-in" | "sign-up" | "forgot" | "update-password";

const MIN_PASSWORD_LENGTH = 8;

const TITLES: Record<AuthMode, string> = {
  "sign-in": "Sign in to Vantage",
  "sign-up": "Create your account",
  forgot: "Reset your password",
  "update-password": "Set a new password",
};

const SUBMIT_LABELS: Record<AuthMode, [idle: string, busy: string]> = {
  "sign-in": ["Sign in", "Signing in…"],
  "sign-up": ["Create account", "Creating account…"],
  forgot: ["Send reset link", "Sending…"],
  "update-password": ["Save password", "Saving…"],
};

// Supabase's messages are written for developers; reword the ones users hit.
function friendlyError(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match an account.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first. The link is in your inbox.";
  if (/already registered/i.test(message)) return "There's already an account with that email. Sign in instead.";
  if (/rate limit/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  return message || "Something went wrong. Try again.";
}

interface AuthFormProps {
  mode: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
}

// Email/password + Google sign-in, sign-up, password reset. Collects only an
// email and password. Used inside AuthDialog on the landing page, and on its
// own for the "set a new password" step after a reset link.
export function AuthForm({ mode, onModeChange }: AuthFormProps) {
  const { signInWithGoogle, signInWithPassword, signUpWithPassword, sendPasswordReset, updatePassword } = useAuth();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation shown in place of the form once an email has been sent.
  const [sentTo, setSentTo] = useState<{ email: string; kind: "confirm" | "reset" } | null>(null);

  const needsEmail = mode !== "update-password";
  const needsPassword = mode !== "forgot";
  const showGoogle = mode === "sign-in" || mode === "sign-up";

  function switchMode(next: AuthMode) {
    setError(null);
    setSentTo(null);
    setPassword("");
    onModeChange?.(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const trimmedEmail = email.trim();
      if (mode === "sign-in") {
        await signInWithPassword(trimmedEmail, password);
      } else if (mode === "sign-up") {
        const { needsConfirmation } = await signUpWithPassword(trimmedEmail, password);
        if (needsConfirmation) setSentTo({ email: trimmedEmail, kind: "confirm" });
      } else if (mode === "forgot") {
        await sendPasswordReset(trimmedEmail);
        setSentTo({ email: trimmedEmail, kind: "reset" });
      } else {
        await updatePassword(password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div key="sent" className="auth-form" role="status">
        <h2 className="auth-form__title">Check your email</h2>
        <p className="auth-form__lede">
          {sentTo.kind === "confirm"
            ? "We sent a confirmation link to "
            : "If there's an account for that address, we sent a reset link to "}
          <strong>{sentTo.email}</strong>.
          {sentTo.kind === "confirm" ? " Open it to finish creating your account." : ""}
        </p>
        <button type="button" className="auth-form__link" onClick={() => switchMode("sign-in")}>
          Back to sign in
        </button>
      </div>
    );
  }

  const [idleLabel, busyLabel] = SUBMIT_LABELS[mode];

  return (
    // Keyed by mode so switching sign in ↔ sign up replays the fade-in
    // (the form's state lives in this component, so it survives the remount).
    <div key={mode} className="auth-form">
      <h2 className="auth-form__title">{TITLES[mode]}</h2>
      {mode === "sign-up" && (
        <p className="auth-form__lede">All we need is an email and a password.</p>
      )}
      {mode === "forgot" && (
        <p className="auth-form__lede">Enter your account's email and we'll send you a link to pick a new password.</p>
      )}

      {showGoogle && (
        <>
          <button type="button" className="landing-btn landing-btn--ghost landing-btn--block" onClick={signInWithGoogle}>
            <GoogleIcon />
            Continue with Google
          </button>
          <div className="auth-form__divider">
            <span>or with email</span>
          </div>
        </>
      )}

      <form className="auth-form__fields" onSubmit={handleSubmit}>
        {needsEmail && (
          <label className="auth-form__field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {needsPassword && (
          // Not a wrapping <label>: the "Forgot password?" button inside it
          // would become part of the input's accessible name.
          <div className="auth-form__field">
            <span className="auth-form__label-row">
              <label htmlFor={passwordId}>{mode === "update-password" ? "New password" : "Password"}</label>
              {mode === "sign-in" && (
                <button type="button" className="auth-form__link" onClick={() => switchMode("forgot")}>
                  Forgot password?
                </button>
              )}
            </span>
            <input
              id={passwordId}
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
              minLength={mode === "sign-in" ? undefined : MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode !== "sign-in" && <small>At least {MIN_PASSWORD_LENGTH} characters.</small>}
          </div>
        )}

        {error && (
          <p className="auth-form__error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="landing-btn landing-btn--primary landing-btn--block" disabled={busy}>
          {busy ? busyLabel : idleLabel}
        </button>
      </form>

      {mode === "sign-in" && (
        <p className="auth-form__switch">
          New to Vantage?{" "}
          <button type="button" className="auth-form__link" onClick={() => switchMode("sign-up")}>
            Create an account
          </button>
        </p>
      )}
      {mode === "sign-up" && (
        <p className="auth-form__switch">
          Already have an account?{" "}
          <button type="button" className="auth-form__link" onClick={() => switchMode("sign-in")}>
            Sign in
          </button>
        </p>
      )}
      {mode === "forgot" && (
        <p className="auth-form__switch">
          <button type="button" className="auth-form__link" onClick={() => switchMode("sign-in")}>
            Back to sign in
          </button>
        </p>
      )}
    </div>
  );
}
