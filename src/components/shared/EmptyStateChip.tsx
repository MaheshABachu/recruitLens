interface EmptyStateChipProps {
  label: string;
  actionLabel: string;
}

/**
 * Renders the dimmed, disabled state for a material that hasn't been
 * generated yet. The action has nowhere to go until Resume exists, so it's a
 * disabled control rather than a broken navigation link.
 */
export function EmptyStateChip({ label, actionLabel }: EmptyStateChipProps) {
  return (
    <div className="material-chip material-chip--empty">
      <span className="material-chip__label">{label}</span>
      <button type="button" className="material-chip__action" disabled aria-disabled="true">
        {actionLabel} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
