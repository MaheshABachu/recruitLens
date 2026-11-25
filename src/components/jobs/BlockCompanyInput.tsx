import { useId, useMemo, useState } from "react";
import { toAlertCompany, type AlertCompany } from "../../lib/alerts";
import type { JobPosting } from "../../types/jobPosting";

interface BlockCompanyInputProps {
  postings: JobPosting[];
  // The job-alert blocked list (alert_excluded_companies).
  value: AlertCompany[];
  onChange: (next: AlertCompany[]) => void;
}

const MAX_OPTIONS = 8;
const MAX_BLOCKED = 50;

type Option = { kind: "block"; name: string; count: number } | { kind: "unblock"; company: AlertCompany };

// Small typeahead in the job boards' toggle row. Typing offers the board's
// companies (with posting counts) to block, or the typed name as is; focusing
// it empty lists what's blocked, each with an unblock option.
export function BlockCompanyInput({ postings, value, onChange }: BlockCompanyInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blockedKeys = useMemo(() => new Set(value.map((c) => c.nameKey)), [value]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of postings) map.set(p.company, (map.get(p.company) ?? 0) + 1);
    return map;
  }, [postings]);

  const options = useMemo((): Option[] => {
    if (!open) return [];
    const q = query.trim();
    if (!q) return value.map((company) => ({ kind: "unblock", company }));
    const lower = q.toLowerCase();
    const matches: Option[] = [...counts.keys()]
      .filter((name) => name.toLowerCase().includes(lower) && !blockedKeys.has(toAlertCompany(name).nameKey))
      .sort(
        (a, b) =>
          Number(!a.toLowerCase().startsWith(lower)) - Number(!b.toLowerCase().startsWith(lower)) ||
          (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
      )
      .slice(0, MAX_OPTIONS)
      .map((name) => ({ kind: "block", name, count: counts.get(name) ?? 0 }));
    const typedKey = toAlertCompany(q).nameKey;
    if (typedKey && !blockedKeys.has(typedKey) && !counts.has(q)) matches.push({ kind: "block", name: q, count: 0 });
    return matches;
  }, [open, query, value, counts, blockedKeys]);
  const showList = open && options.length > 0;
  const full = value.length >= MAX_BLOCKED;

  function choose(option: Option) {
    setQuery("");
    setActive(0);
    if (option.kind === "unblock") {
      onChange(value.filter((c) => c.nameKey !== option.company.nameKey));
      return;
    }
    const company = toAlertCompany(option.name);
    if (full || !company.nameKey || blockedKeys.has(company.nameKey)) return;
    onChange([...value, company]);
  }

  return (
    <div className="jobs-location jobs-block">
      <input
        type="text"
        className="jobs-location__input"
        placeholder={full ? `Up to ${MAX_BLOCKED} blocked` : "Block a company…"}
        value={query}
        autoComplete="off"
        role="combobox"
        aria-label="Block a company"
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
            if (showList && query.trim()) choose(options[Math.min(active, options.length - 1)]);
          }
        }}
      />
      {showList && (
        <ul className="jobs-location__list" id={listId} role="listbox">
          {!query.trim() && <li className="jobs-block__heading">Blocked — click to unblock</li>}
          {options.map((option, i) => (
            <li
              key={option.kind === "block" ? `b-${option.name}` : `u-${option.company.nameKey}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`jobs-location__option${i === active ? " jobs-location__option--active" : ""}`}
              // mousedown, not click: fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {option.kind === "block" ? (
                <>
                  <span>{option.count > 0 ? option.name : `Block “${option.name}”`}</span>
                  {option.count > 0 && <span className="jobs-location__count">{option.count.toLocaleString()}</span>}
                </>
              ) : (
                <>
                  <span>{option.company.displayName}</span>
                  <span className="jobs-location__count" aria-hidden="true">×</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
