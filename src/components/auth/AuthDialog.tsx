import { useEffect, useRef, useState } from "react";
import { AuthForm, type AuthMode } from "./AuthForm";

interface AuthDialogProps {
  mode: AuthMode | null;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
}

// Modal wrapper around AuthForm for the landing page. A native <dialog> opened
// with showModal() gives focus trapping, Esc-to-close and the backdrop for free.
// Opening fades in via CSS; closing sets data-closing so the fade-out plays
// before dialog.close() removes it.
export function AuthDialog({ mode, onModeChange, onClose }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Last open mode, kept after `mode` goes null so the form stays visible
  // while it fades out; cleared once closed so the next open starts fresh.
  const [shownMode, setShownMode] = useState<AuthMode | null>(mode);
  const renderedMode = mode ?? shownMode;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (mode) {
      setShownMode(mode);
      if (!dialog.open) {
        delete dialog.dataset.closing;
        dialog.showModal();
        // showModal() focuses the first focusable element (the close button);
        // start in the email field instead.
        dialog.querySelector<HTMLInputElement>("input")?.focus();
      }
      return;
    }

    if (!dialog.open) return;
    let fallback: number | undefined;
    const finish = () => {
      window.clearTimeout(fallback);
      delete dialog.dataset.closing;
      if (dialog.open) dialog.close();
      setShownMode(null);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    dialog.dataset.closing = "";
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === dialog) finish();
    };
    dialog.addEventListener("animationend", onAnimationEnd);
    // In case animationend never fires (e.g. the tab is hidden).
    fallback = window.setTimeout(finish, 300);
    return () => {
      dialog.removeEventListener("animationend", onAnimationEnd);
      window.clearTimeout(fallback);
    };
  }, [mode]);

  return (
    <dialog
      ref={dialogRef}
      className="auth-dialog"
      aria-label="Sign in or create an account"
      onClose={onClose}
      // Esc would close instantly; route it through onClose so it fades too.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Clicks on the backdrop land on the <dialog> element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* The dialog itself has no padding, so only true backdrop clicks hit it. */}
      <div className="auth-dialog__body">
        <button type="button" className="auth-dialog__close" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {renderedMode && <AuthForm mode={renderedMode} onModeChange={onModeChange} />}
      </div>
    </dialog>
  );
}
