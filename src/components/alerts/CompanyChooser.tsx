import { useId, useMemo, useState, type ReactNode } from "react";
import { toAlertCompany, type AlertCompany } from "../../lib/alerts";
import { QuickPicks } from "./QuickPicks";

export interface CompanyQuickPicks {
  title: string;
  items: { label: string; detail?: string }[];
}

interface CompanyChooserProps {
  label: string;
  hint: string;
  // Typeahead pool (the question bank's ~470 companies, plus recommendations).
  names: string[];
  value: AlertCompany[];
  onChange: (companies: AlertCompany[]) => void;
  // A switch above the chips (Any FAANG+ / Block defense tech).
  toggle?: { label: string; on: boolean; onChange: (on: boolean) => void; className?: string; note?: ReactNode };
  // One-tap rows under the field; picks already chosen are hidden.
  quickPicks?: CompanyQuickPicks[];
  // "blocked" styles the chips as exclusions.
  tone?: "blocked";
  placeholder?: string;
}

const MAX_COMPANIES = 50;
const MAX_OPTIONS = 8;

// A company list for alerts (ideal companies, or blocked ones). Any name can be
// added, not just the typeahead's: postings are matched on companyKey(), so
// "Amazon" also catches "Amazon Web Services (AWS)".
export function CompanyChooser({
  label,
  hint,
  names,
  value,
  onChange,
  toggle,
  quickPicks = [],
  tone,
  placeholder = "Add a company…",
}: CompanyChooserProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputId = useId();
  const listId = useId();
  const chosenKeys = useMemo(() => new Set(value.map((c) => c.nameKey)), [value]);
  const full = value.length >= MAX_COMPANIES;

  // Bank matches (prefix matches first), then "Add “typed”" when the typed
  // name isn't one of them.
  const options = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const pool = [...new Set(names)];
    const matches = pool
      .filter((n) => n.toLowerCase().includes(lower) && !chosenKeys.has(toAlertCompany(n).nameKey))
      .sort((a, b) => Number(!a.toLowerCase().startsWith(lower)) - Number(!b.toLowerCase().startsWith(lower)))
      .slice(0, MAX_OPTIONS)
      .map((name) => ({ name, typed: false }));
    const typedKey = toAlertCompany(q).nameKey;
    const addTyped = typedKey !== "" && !chosenKeys.has(typedKey) && !pool.some((n) => n.toLowerCase() === lower);
    return addTyped ? [...matches, { name: q, typed: true }] : matches;
  }, [names, query, chosenKeys]);
  const showList = open && options.length > 0;

  // Each row hides what's chosen and what an earlier row already offers.
  const offered = new Set(chosenKeys);
  const openPicks = quickPicks.map((section) => ({
    title: section.title,
    items: section.items.filter((item) => {
      const key = toAlertCompany(item.label).nameKey;
      if (offered.has(key)) return false;
      offered.add(key);
      return true;
    }),
  }));

  function add(name: string) {
    setQuery("");
    setActive(0);
    const company = toAlertCompany(name);
    if (full || !company.nameKey || chosenKeys.has(company.nameKey)) return;
    onChange([...value, company]);
  }

  return (
    <div className="alerts-field">
      <label className="alerts-field__label" htmlFor={inputId}>
        {label} <span className="alerts-field__optional">Optional</span>
      </label>
      <p className="alerts-field__hint">{hint}</p>

      {toggle && (
        <>
          <button
            type="button"
            className={`alerts-toggle ${toggle.className ?? ""}${toggle.on ? " alerts-toggle--on" : ""}`}
            aria-pressed={toggle.on}
            onClick={() => toggle.onChange(!toggle.on)}
          >
            {toggle.label}
          </button>
          {toggle.note}
        </>
      )}

      {value.length > 0 && (
        <div className="alerts-chips alerts-chips--static">
          {value.map((c) => (
            <span key={c.nameKey} className={`alerts-chip${tone === "blocked" ? " alerts-chip--blocked" : ""}`}>
              {c.displayName}
              <button
                type="button"
                className="alerts-chip__remove"
                onClick={() => onChange(value.filter((v) => v.nameKey !== c.nameKey))}
                aria-label={`Remove ${c.displayName}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="alerts-combo">
        <input
          id={inputId}
          type="text"
          className="alerts-input"
          placeholder={full ? `Up to ${MAX_COMPANIES} companies` : placeholder}
          disabled={full}
          value={query}
          autoComplete="off"
          role="combobox"
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
              if (showList) add(options[Math.min(active, options.length - 1)].name);
            }
          }}
        />
        {showList && (
          <ul className="alerts-combo__list" id={listId} role="listbox">
            {options.map((option, i) => (
              <li
                key={`${option.typed}-${option.name}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`alerts-combo__option${i === active ? " alerts-combo__option--active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(option.name);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {option.typed ? `Add “${option.name}”` : option.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!full &&
        openPicks.map((section) => (
          <QuickPicks key={section.title} title={section.title} items={section.items} onPick={add} />
        ))}
    </div>
  );
}
