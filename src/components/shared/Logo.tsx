export function Logo({ size = 22 }: { size?: number }) {
  return (
    <div className="logo">
      <span className="logo__mark" aria-hidden="true">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
          <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="logo__text">
        Van<span className="logo__accent">tage</span>
      </span>
    </div>
  );
}
