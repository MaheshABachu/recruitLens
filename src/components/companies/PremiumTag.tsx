// Marks a LeetCode Premium (paid-only) problem, so users know before clicking
// that LeetCode will block it without a Premium subscription.
export function PremiumTag() {
  return (
    <span className="tag tag--premium" title="LeetCode Premium: needs a LeetCode subscription to open">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2.4" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      Premium
    </span>
  );
}
