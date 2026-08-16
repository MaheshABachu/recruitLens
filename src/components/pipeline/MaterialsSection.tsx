import type { Role } from "../../types/pipeline";
import { EmptyStateChip } from "../shared/EmptyStateChip";

interface MaterialsSectionProps {
  role: Role;
}

/** Renders a filled chip or an empty-state chip per material, driven entirely by props. */
export function MaterialsSection({ role }: MaterialsSectionProps) {
  return (
    <div className="materials-grid">
      {role.resumeUsed ? (
        <div className="material-chip">
          <span className="material-chip__label">{role.resumeUsed}</span>
          {typeof role.resumeMatch === "number" && (
            <span className="material-chip__match">{role.resumeMatch}% match</span>
          )}
          <button type="button" className="material-chip__action" disabled aria-disabled="true">
            View <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <EmptyStateChip label="Resume" actionLabel="Generate" />
      )}

      {role.coverLetterUsed ? (
        <div className="material-chip">
          <span className="material-chip__label">{role.coverLetterUsed}</span>
          <button type="button" className="material-chip__action" disabled aria-disabled="true">
            View <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <EmptyStateChip label="Cover letter" actionLabel="Generate" />
      )}
    </div>
  );
}
