import type { Role } from "../../types/pipeline";

interface FieldGridProps {
  role: Role;
}

interface FieldDef {
  label: string;
  value?: string;
}

/** Pure presentational — renders activeRole's fields, dimmed placeholder text for anything undefined. */
export function FieldGrid({ role }: FieldGridProps) {
  const fields: FieldDef[] = [
    { label: "Next action", value: role.nextAction },
    { label: "Next date", value: role.nextDate },
    { label: "Recruiter", value: role.recruiter },
    { label: "Format", value: role.format },
    { label: "Interview style", value: role.style },
    { label: "Notes", value: role.notes },
  ];

  return (
    <div className="field-grid">
      {fields.map((field) => (
        <div className="field-grid__item" key={field.label}>
          <span className="field-grid__label">{field.label}</span>
          <span className={`field-grid__value ${!field.value ? "field-grid__value--empty" : ""}`}>
            {field.value ?? "Not set"}
          </span>
        </div>
      ))}
    </div>
  );
}
