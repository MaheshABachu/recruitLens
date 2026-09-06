import { useEffect, useState, type FormEvent } from "react";
import type { PipelineStatus } from "../../types/pipeline";

interface AddCompanyModalProps {
  onClose: () => void;
  onSubmit: (input: { name: string; role: string; status: PipelineStatus }) => void;
}

const STAGES: PipelineStatus[] = ["Not Applied", "Applied", "OA", "Phone Screen", "Onsite", "Offer", "Rejected"];

export function AddCompanyModal({ onClose, onSubmit }: AddCompanyModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<PipelineStatus>("Not Applied");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSubmit({ name: trimmedName, role: role.trim() || "Application", status });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add company"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2>Add company</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit}>
          <div className="field-grid__item field-grid__item--wide">
            <label className="field-grid__label" htmlFor="add-company-name">
              Company name
            </label>
            <input
              id="add-company-name"
              className="field-grid__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              autoFocus
              required
            />
          </div>

          <div className="field-grid__item field-grid__item--wide">
            <label className="field-grid__label" htmlFor="add-company-role">
              Role
            </label>
            <input
              id="add-company-role"
              className="field-grid__input"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Engineer Intern"
            />
          </div>

          <div className="field-grid__item field-grid__item--wide">
            <label className="field-grid__label" htmlFor="add-company-status">
              Stage
            </label>
            <select
              id="add-company-status"
              className="field-grid__input"
              value={status}
              onChange={(e) => setStatus(e.target.value as PipelineStatus)}
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <div className="modal__actions">
            <button type="button" className="modal__cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal__submit" disabled={!name.trim()}>
              Add company
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
