import { useEffect, useState, type FormEvent } from "react";
import type { PipelineStatus } from "../../types/pipeline";

interface AddRoleModalProps {
  companyName: string;
  onClose: () => void;
  onSubmit: (input: { role: string; status: PipelineStatus }) => void;
}

const STAGES: PipelineStatus[] = ["Not Applied", "Applied", "OA", "Phone Screen", "Onsite", "Offer", "Rejected"];

export function AddRoleModal({ companyName, onClose, onSubmit }: AddRoleModalProps) {
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
    const trimmedRole = role.trim();
    if (!trimmedRole) return;
    onSubmit({ role: trimmedRole, status });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Add role at ${companyName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2>Add role at {companyName}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit}>
          <div className="field-grid__item field-grid__item--wide">
            <label className="field-grid__label" htmlFor="add-role-title">
              Role
            </label>
            <input
              id="add-role-title"
              className="field-grid__input"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Engineer Intern"
              autoFocus
              required
            />
          </div>

          <div className="field-grid__item field-grid__item--wide">
            <label className="field-grid__label" htmlFor="add-role-status">
              Stage
            </label>
            <select
              id="add-role-status"
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
            <button type="submit" className="modal__submit" disabled={!role.trim()}>
              Add role
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
