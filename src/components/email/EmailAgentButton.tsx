interface EmailAgentButtonProps {
  isConnected: boolean;
  isSyncing: boolean;
  onClick: () => void;
}

/** Topbar icon button that opens the email agent panel. Sits next to the theme toggle. */
export function EmailAgentButton({ isConnected, isSyncing, onClick }: EmailAgentButtonProps) {
  return (
    <button
      type="button"
      className="email-agent-button"
      onClick={onClick}
      aria-label="Gmail sync agent"
    >
      {isSyncing ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="email-agent-button__spinner"
        >
          <path
            d="M21 12a9 9 0 1 1-3-6.7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {isConnected && <span className="email-agent-button__dot" aria-hidden="true" />}
    </button>
  );
}
