import { useEffect, useMemo, useRef, useState } from "react";

interface TopicSearchProps {
  topics: string[];
  /** Selected topic, or "all" for no topic filter. */
  selected: string;
  onSelect: (topic: string) => void;
}

// Search-as-you-type over the loaded company's topic tags — big companies
// (Google, Meta) carry dozens, too many to scan in a plain <select>. Reuses
// CompanyPicker's field/list styling.
export function TopicSearch({ topics, selected, onSelect }: TopicSearchProps) {
  const [query, setQuery] = useState(selected === "all" ? "" : selected);
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep the field in sync when the selection changes from outside (e.g. the
  // parent falls back to "all" after a company switch).
  useEffect(() => {
    setQuery(selected === "all" ? "" : selected);
  }, [selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Showing the chosen topic's own name in the field shouldn't narrow the
    // list down to just that one entry.
    if (!q || query === selected) return topics;
    return topics.filter((t) => t.toLowerCase().includes(q));
  }, [topics, query, selected]);

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  });

  // Dismissing without picking reverts any half-typed text to the selection.
  function close() {
    setIsOpen(false);
    setQuery(selected === "all" ? "" : selected);
  }

  function choose(topic: string) {
    onSelect(topic);
    setQuery(topic === "all" ? "" : topic);
    setIsOpen(false);
  }

  return (
    <div className="company-picker topic-search" ref={wrapRef}>
      <div className="company-search company-picker__field">
        <svg className="company-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
          <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="company-search__input"
          placeholder={`Filter by topic (${topics.length})…`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            if (e.target.value === "") onSelect("all");
          }}
          onFocus={(e) => {
            setIsOpen(true);
            e.target.select();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key === "Enter" && matches.length > 0) choose(matches[0]);
          }}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="topic-search-list"
          aria-label="Filter by topic"
        />
        {selected !== "all" && (
          <button type="button" className="topic-search__clear" onClick={() => choose("all")} aria-label="Clear topic filter">
            ×
          </button>
        )}
      </div>

      {isOpen && (
        <ul className="company-picker__list" id="topic-search-list" role="listbox">
          {matches.length === 0 ? (
            <li className="company-picker__empty">No topic matches “{query}”.</li>
          ) : (
            matches.map((topic) => (
              <li key={topic}>
                <button
                  type="button"
                  role="option"
                  aria-selected={topic === selected}
                  className={`company-picker__option ${topic === selected ? "company-picker__option--active" : ""}`}
                  onClick={() => choose(topic)}
                >
                  {topic}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
