import { useId, useMemo, useState } from "react";
import { toAlertCompany, type AlertCompany, type CompanySuggestion } from "../../lib/alerts";
import { QuickPicks } from "./QuickPicks";

interface CompanyChooserProps {
  // Typeahead pool (the question bank's ~470 companies).
  names: string[];
  // The user's pinned companies.
  pins: string[];
  // Companies hiring most for the picked kind + roles.
  recommended: CompanySuggestion[];
  value: AlertCompany[];
  onChange: (companies: AlertCompany[]) => void;
  anyFaang: boolean;
  onAnyFaangChange: (on: boolean) => void;
}

const MAX_COMPANIES = 50;
const MAX_OPTIONS = 8;

// Ideal companies for alerts. Any name can be added, not just the typeahead's:
// postings are matched on companyKey(), so "Amazon" also catches
// "Amazon Web Services (AWS)".
export function CompanyChooser({ names, pins, recommended, value, onChange, anyFaang, onAnyFaangChange }: CompanyChooserProps) {
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
    const pool = [...new Set([...names, ...recommended.map((r) => r.displayName)])];
    const matches = pool
      .filter((n) => n.toLowerCase().includes(lower) && !chosenKeys.has(toAlertCompany(n).nameKey))
      .sort((a, b) => Number(!a.toLowerCase().startsWith(lower)) - Number(!b.toLowerCase().startsWith(lower)))
      .slice(0, MAX_OPTIONS)
      .map((name) => ({ name, typed: false }));
    const typedKey = toAlertCompany(q).nameKey;
    const addTyped = typedKey !== "" && !chosenKeys.has(typedKey) && !pool.some((n) => n.toLowerCase() === lower);
    return addTyped ? [...matches, { name: q, typed: true }] : matches;
  }, [names, recommended, query, chosenKeys]);
  const showList = open && options.length > 0;

  const openPins = pins.filter((name) => !chosenKeys.has(toAlertCompany(name).nameKey));
  const pinKeys = new Set(pins.map((name) => toAlertCompany(name).nameKey));
  const openRecommended = recommended.filter((r) => !chosenKeys.has(r.nameKey) && !pinKeys.has(r.nameKey));

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
        Ideal companies <span className="alerts-field__optional">Optional</span>
      </label>
      <p className="alerts-field__hint">Leave empty to hear about every company.</p>

      <button
        type="button"
        className={`alerts-toggle alerts-toggle--faang${anyFaang ? " alerts-toggle--on" : ""}`}
        aria-pressed={anyFaang}
        onClick={() => onAnyFaangChange(!anyFaang)}
      >
        Any FAANG+ company
      </button>

      {value.length > 0 && (
        <div className="alerts-chips alerts-chips--static">
          {value.map((c) => (
            <span key={c.nameKey} className="alerts-chip">
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
          placeholder={full ? `Up to ${MAX_COMPANIES} companies` : "Add a company…"}
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

      {!full && (
        <>
          <QuickPicks title="Your pins" items={openPins.map((label) => ({ label }))} onPick={add} />
          <QuickPicks
            title="Hiring most for your picks"
            items={openRecommended.map((r) => ({ label: r.displayName, detail: String(r.postings) }))}
            onPick={add}
          />
        </>
      )}
    </div>
  );
}
