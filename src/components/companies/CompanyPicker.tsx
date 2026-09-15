import { useEffect, useMemo, useRef, useState } from "react";

interface CompanyPickerProps {
  companies: string[];
  selected: string | null;
  onSelect: (company: string) => void;
}

const MAX_RESULTS = 60;

// Search-as-you-type over the ~470 companies the question bank covers. The
// whole list is already in memory (useLcCompanies), so filtering is local —
// no per-keystroke request.
export function CompanyPicker({ companies, selected, onSelect }: CompanyPickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? companies.filter((name) => name.toLowerCase().includes(q)) : companies;
    return pool.slice(0, MAX_RESULTS);
  }, [companies, query]);

  // Clicking anywhere outside dismisses the list — the input keeps focus
  // semantics simple (no roving tabindex) since the list is plain buttons.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  function choose(name: string) {
    onSelect(name);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div className="company-picker" ref={wrapRef}>
      <div className="company-search company-picker__field">
        <svg className="company-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
          <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="company-search__input"
          placeholder={selected ? `Look up another company (${companies.length})…` : "Look up a company…"}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setIsOpen(false);
            if (e.key === "Enter" && matches.length > 0) choose(matches[0]);
          }}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="company-picker-list"
          aria-label="Look up a company"
        />
      </div>

      {isOpen && (
        <ul className="company-picker__list" id="company-picker-list" role="listbox">
          {matches.length === 0 ? (
            <li className="company-picker__empty">No company matches “{query}”.</li>
          ) : (
            matches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={name === selected}
                  className={`company-picker__option ${name === selected ? "company-picker__option--active" : ""}`}
                  onClick={() => choose(name)}
                >
                  {name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
