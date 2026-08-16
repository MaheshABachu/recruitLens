interface CompanySearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function CompanySearch({ value, onChange }: CompanySearchProps) {
  return (
    <div className="company-search">
      <svg
        className="company-search__icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
        <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        className="company-search__input"
        placeholder="Search companies…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search companies"
      />
    </div>
  );
}
