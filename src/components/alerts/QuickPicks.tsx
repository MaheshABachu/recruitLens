interface QuickPicksProps {
  title: string;
  items: { label: string; detail?: string }[];
  onPick: (label: string) => void;
}

// A row of one-tap "+ Name" suggestions under a field.
export function QuickPicks({ title, items, onPick }: QuickPicksProps) {
  if (items.length === 0) return null;
  return (
    <div className="alerts-suggestions">
      <span className="alerts-suggestions__label">{title}</span>
      {items.map((item) => (
        <button key={item.label} type="button" className="alerts-suggestion" onClick={() => onPick(item.label)}>
          + {item.label}
          {item.detail && <span className="alerts-suggestion__detail">{item.detail}</span>}
        </button>
      ))}
    </div>
  );
}
