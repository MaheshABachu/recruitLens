import { useEffect, useId, useRef, useState } from "react";
import type { AlertCompany } from "../../lib/alerts";

interface HideBlockedToggleProps {
  hide: boolean;
  onHideChange: (hide: boolean) => void;
  // The job-alert blocked list (alert_excluded_companies).
  blocked: AlertCompany[];
  onBlockedChange: (next: AlertCompany[]) => void;
  // "Block defense tech" is on in the user's alert settings.
  excludeDefense: boolean;
}

// The checkbox turns the filter on/off; the label opens a dropdown of every
// blocked company, each with a checkbox — uncheck to unblock. Rows stay in the
// list until it closes, so an accidental uncheck can be re-checked.
export function HideBlockedToggle({ hide, onHideChange, blocked, onBlockedChange, excludeDefense }: HideBlockedToggleProps) {
  const [open, setOpen] = useState(false);
  // Everything shown since the dropdown opened (blocked now or unchecked meanwhile).
  const [shown, setShown] = useState<AlertCompany[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const blockedKeys = new Set(blocked.map((c) => c.nameKey));

  // Companies blocked while it's open (from the search box) join the list.
  useEffect(() => {
    if (!open) return;
    setShown((prev) => {
      const keys = new Set(prev.map((c) => c.nameKey));
      const added = blocked.filter((c) => !keys.has(c.nameKey));
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [open, blocked]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    if (!open) setShown(blocked);
    setOpen((o) => !o);
  }

  function setBlocked(company: AlertCompany, on: boolean) {
    if (on) {
      if (!blockedKeys.has(company.nameKey)) onBlockedChange([...blocked, company]);
    } else {
      onBlockedChange(blocked.filter((c) => c.nameKey !== company.nameKey));
    }
  }

  return (
    <div className={`jobs-hide-blocked${hide ? " jobs-hide-blocked--on" : ""}`} ref={rootRef}>
      <input
        type="checkbox"
        className="jobs-hide-blocked__check"
        checked={hide}
        onChange={(e) => onHideChange(e.target.checked)}
        aria-label="Hide blocked companies"
      />
      <button
        type="button"
        className="jobs-hide-blocked__label"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggleOpen}
      >
        Hide blocked companies
        {blocked.length > 0 && <span className="jobs-hide-blocked__count">{blocked.length}</span>}
        <span className="jobs-hide-blocked__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="jobs-hide-blocked__menu" id={listId}>
          {shown.length === 0 ? (
            <p className="jobs-hide-blocked__empty">No blocked companies yet. Use “Block a company…” to add one.</p>
          ) : (
            <>
              <p className="jobs-hide-blocked__heading">Uncheck to unblock</p>
              <ul className="jobs-hide-blocked__list">
                {shown.map((c) => (
                  <li key={c.nameKey}>
                    <label className="jobs-hide-blocked__item">
                      <input
                        type="checkbox"
                        checked={blockedKeys.has(c.nameKey)}
                        onChange={(e) => setBlocked(c, e.target.checked)}
                      />
                      <span>{c.displayName}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {excludeDefense && (
            <p className="jobs-hide-blocked__note">Defense tech is also hidden (Account → Job alerts).</p>
          )}
        </div>
      )}
    </div>
  );
}
