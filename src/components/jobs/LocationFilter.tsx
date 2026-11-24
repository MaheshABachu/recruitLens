import { useId, useMemo, useState } from "react";
import { LOCATION_SUGGESTIONS, locationMatches } from "../../lib/alertLocations";
import type { JobPosting } from "../../types/jobPosting";

interface LocationFilterProps {
  postings: JobPosting[];
  value: string[];
  onChange: (places: string[]) => void;
}

const MAX_OPTIONS = 8;
// Shown on focus before anything is typed.
const POPULAR = ["Remote", "SF Bay Area", "New York City", "Seattle area", "Austin, TX", "Boston area", "Los Angeles area", "Chicago, IL"];

// Does a posting fall in any of the picked places? Places use the same
// matching as job alerts (src/lib/alertLocations.ts): "SF Bay Area" covers
// Sunnyvale, "NYC" counts as New York City, "Texas (state)" catches ", TX".
export function postingInPlaces(posting: JobPosting, places: string[]): boolean {
  return places.length === 0 || places.some((place) => locationMatches(posting.location, place));
}

// Typeahead over known places (areas, busy cities, states), each with how many
// postings it would show. Enter on text that isn't a known place adds it as
// free text, matched as a whole word.
export function LocationFilter({ postings, value, onChange }: LocationFilterProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const chosen = useMemo(() => new Set(value.map((v) => v.toLowerCase())), [value]);

  // Counts are computed for the handful of options on screen only.
  const options = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const pool = q
      ? LOCATION_SUGGESTIONS.filter((s) => s.toLowerCase().includes(q)).sort(
          (a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)),
        )
      : POPULAR;
    const picked = pool
      .filter((s) => !chosen.has(s.toLowerCase()))
      .slice(0, MAX_OPTIONS)
      .map((label) => ({ label, count: postings.filter((p) => locationMatches(p.location, label)).length, typed: false }))
      .filter((o) => o.count > 0);
    const exact = LOCATION_SUGGESTIONS.some((s) => s.toLowerCase() === q);
    if (q && !exact && !chosen.has(q)) {
      const typed = query.trim();
      picked.push({ label: typed, count: postings.filter((p) => locationMatches(p.location, typed)).length, typed: true });
    }
    return picked;
  }, [open, query, chosen, postings]);
  const showList = open && options.length > 0;

  function add(label: string) {
    setQuery("");
    setActive(0);
    const cleaned = label.trim().replace(/\s+/g, " ");
    if (!cleaned || chosen.has(cleaned.toLowerCase())) return;
    onChange([...value, cleaned]);
  }

  return (
    <div className="jobs-location">
      <input
        type="text"
        className={`jobs-location__input${value.length > 0 ? " jobs-location__input--active" : ""}`}
        placeholder={value.length > 0 ? "Add another location…" : "Any location"}
        value={query}
        autoComplete="off"
        role="combobox"
        aria-label="Filter by location"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (showList && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (showList && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (showList) add(options[Math.min(active, options.length - 1)].label);
            else if (query.trim()) add(query);
          } else if (e.key === "Backspace" && query === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
      />
      {showList && (
        <ul className="jobs-location__list" id={listId} role="listbox">
          {options.map((option, i) => (
            <li
              key={`${option.typed}-${option.label}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`jobs-location__option${i === active ? " jobs-location__option--active" : ""}`}
              // mousedown, not click: fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                add(option.label);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{option.typed ? `“${option.label}”` : option.label}</span>
              <span className="jobs-location__count">{option.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
