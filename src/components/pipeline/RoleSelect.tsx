import type { Role } from "../../types/pipeline";

interface RoleSelectProps {
  roles: Role[];
  activeIndex: number;
  onChange: (index: number) => void;
}

export function RoleSelect({ roles, activeIndex, onChange }: RoleSelectProps) {
  return (
    <select
      className="role-select"
      value={activeIndex}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Select role"
    >
      {roles.map((role, index) => (
        <option key={role.role} value={index}>
          {role.role}
        </option>
      ))}
    </select>
  );
}
