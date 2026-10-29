import type { CSSProperties } from "react";
import { companyHueVar, monogram } from "../../lib/companyColors";

interface CompanyMonogramProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// Two-letter badge tinted in the company's hue. Decorative: the company name
// is always rendered next to it.
export function CompanyMonogram({ name, size = "md", className = "" }: CompanyMonogramProps) {
  return (
    <span
      className={`company-monogram company-monogram--${size} ${className}`}
      style={{ "--monogram-hue": companyHueVar(name) } as CSSProperties}
      aria-hidden="true"
    >
      {monogram(name)}
    </span>
  );
}
