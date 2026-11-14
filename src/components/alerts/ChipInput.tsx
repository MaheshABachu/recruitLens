import { useId, useMemo, useState } from "react";
import { MAX_LIST_ITEMS } from "../../lib/alerts";
import { QuickPicks } from "./QuickPicks";

interface ChipInputProps {
  label: string;
  hint?: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
  // Typeahead options while typing (Enter picks the highlighted one).
  suggestions?: string[];
  // One-tap picks shown under the field.
  quickPicks?: { title: string; items: string[] };
}

const MAX_OPTIONS = 8;

// Free-text chips. Enter or comma adds, Backspace on an empty field removes the
// last one. With suggestions, typing opens a list (arrow keys + Enter) that
// ends with "Add “…”" for text that isn't one of them.
export function ChipInput({ label, hint, placeholder, values, onChange, suggestions, quickPicks }: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputId = useId();
  const hintId = useId();
  const listId = useId();
  const full = values.length >= MAX_LIST_ITEMS;
  const chosen = useMemo(() => new Set(values.map((v) => v.toLowerCase())), [values]);

  const options = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!suggestions || !q) return [];
    const matches = suggestions
      .filter((s) => s.toLowerCase().includes(q) && !chosen.has(s.toLowerCase()))
      .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)))
      .slice(0, MAX_OPTIONS)
      .map((value) => ({ value, typed: false }));
    const exact = suggestions.some((s) => s.toLowerCase() === q);
    return exact || chosen.has(q) ? matches : [...matches, { value: draft.trim(), typed: true }];
  }, [draft, suggestions, chosen]);
  const showList = open && options.length > 0;

  function add(raw: string) {
    setDraft("");
    setActive(0);
    const value = raw.replace(/,/g, "").trim().replace(/\s+/g, " ");
    if (!value || full || chosen.has(value.toLowerCase())) return;
    onChange([...values, value]);
  }

  const openPicks = quickPicks ? quickPicks.items.filter((item) => !chosen.has(item.toLowerCase())) : [];

  return (
    <div className="alerts-field">
      <label className="alerts-field__label" htmlFor={inputId}>
        {label} <span className="alerts-field__optional">Optional</span>
      </label>
      {hint && (
        <p className="alerts-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      <div className="alerts-combo">
        <div className="alerts-chips">
          {values.map((value) => (
            <span key={value.toLowerCase()} className="alerts-chip">
              {value}
              <button
                type="button"
                className="alerts-chip__remove"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id={inputId}
            className="alerts-chips__input"
            type="text"
            value={draft}
            placeholder={full ? `Up to ${MAX_LIST_ITEMS}` : placeholder}
            disabled={full}
            autoComplete="off"
            aria-describedby={hint ? hintId : undefined}
            role={suggestions ? "combobox" : undefined}
            aria-expanded={suggestions ? showList : undefined}
            aria-controls={suggestions ? listId : undefined}
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            onChange={(e) => {
              if (e.target.value.includes(",")) return add(e.target.value);
              setDraft(e.target.value);
              setActive(0);
              setOpen(true);
            }}
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
                add(showList ? options[Math.min(active, options.length - 1)].value : draft);
              } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={() => {
              setOpen(false);
              // Without a suggestion list, typed text counts on leaving the field.
              if (!suggestions) add(draft);
            }}
          />
        </div>
        {showList && (
          <ul className="alerts-combo__list" id={listId} role="listbox">
            {options.map((option, i) => (
              <li
                key={`${option.typed}-${option.value}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`alerts-combo__option${i === active ? " alerts-combo__option--active" : ""}`}
                // mousedown, not click: fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(option.value);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {option.typed ? `Add “${option.value}”` : option.value}
              </li>
            ))}
          </ul>
        )}
      </div>
      {quickPicks && !full && <QuickPicks title={quickPicks.title} items={openPicks.map((label) => ({ label }))} onPick={add} />}
    </div>
  );
}
