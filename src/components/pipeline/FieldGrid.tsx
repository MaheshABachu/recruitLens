import type { PipelineStatus, Role } from "../../types/pipeline";

interface FieldGridProps {
  role: Role;
  onChange: <K extends keyof Role>(field: K, value: Role[K]) => void;
}

const STAGES: PipelineStatus[] = ["Not Applied", "Applied", "OA", "Phone Screen", "Onsite", "Offer", "Rejected"];

/** Editable — every field writes back through onChange as the user edits. */
export function FieldGrid({ role, onChange }: FieldGridProps) {
  return (
    <div className="field-grid">
      <div className="field-grid__item">
        <label className="field-grid__label" htmlFor="field-stage">
          Stage
        </label>
        <select
          id="field-stage"
          className="field-grid__input"
          value={role.status}
          onChange={(e) => onChange("status", e.target.value as PipelineStatus)}
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>

      <div className="field-grid__item">
        <label className="field-grid__label" htmlFor="field-next-action">
          Next action
        </label>
        <input
          id="field-next-action"
          className="field-grid__input"
          type="text"
          value={role.nextAction ?? ""}
          placeholder="Not set"
          onChange={(e) => onChange("nextAction", e.target.value || undefined)}
        />
      </div>

      <div className="field-grid__item">
        <label className="field-grid__label" htmlFor="field-next-date">
          Next date
        </label>
        <input
          id="field-next-date"
          className="field-grid__input"
          type="date"
          value={role.nextDate ?? ""}
          onChange={(e) => onChange("nextDate", e.target.value || undefined)}
        />
      </div>

      <div className="field-grid__item">
        <label className="field-grid__label" htmlFor="field-recruiter">
          Recruiter
        </label>
        <input
          id="field-recruiter"
          className="field-grid__input"
          type="text"
          value={role.recruiter ?? ""}
          placeholder="Not set"
          onChange={(e) => onChange("recruiter", e.target.value || undefined)}
        />
      </div>

      <div className="field-grid__item">
        <label className="field-grid__label" htmlFor="field-format">
          Format
        </label>
        <input
          id="field-format"
          className="field-grid__input"
          type="text"
          value={role.format ?? ""}
          placeholder="Not set"
          onChange={(e) => onChange("format", e.target.value || undefined)}
        />
      </div>

      <div className="field-grid__item">
        <label className="field-grid__label" htmlFor="field-style">
          Interview style
        </label>
        <input
          id="field-style"
          className="field-grid__input"
          type="text"
          value={role.style ?? ""}
          placeholder="Not set"
          onChange={(e) => onChange("style", e.target.value || undefined)}
        />
      </div>

      <div className="field-grid__item field-grid__item--wide">
        <label className="field-grid__label" htmlFor="field-notes">
          Notes
        </label>
        <textarea
          id="field-notes"
          className="field-grid__input field-grid__textarea"
          value={role.notes ?? ""}
          placeholder="Not set"
          rows={3}
          onChange={(e) => onChange("notes", e.target.value || undefined)}
        />
      </div>
    </div>
  );
}
