import { useState, type CSSProperties } from "react";
import { companyHueVar, monogram } from "../../lib/companyColors";
import { logoUrl, markLogoFailed, useCompanyDomain } from "../../lib/companyLogos";
import { useTheme } from "../../hooks/useTheme";

interface CompanyMonogramProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// Company logo when one is known (see src/lib/companyLogos.ts), otherwise a
// two-letter badge tinted in the company's hue. Decorative either way: the
// company name is always rendered next to it.
export function CompanyMonogram({ name, size = "md", className = "" }: CompanyMonogramProps) {
  const domain = useCompanyDomain(name);
  const { theme } = useTheme();
  const [broken, setBroken] = useState<string | null>(null);
  const showLogo = domain !== null && broken !== domain;

  return (
    <span
      className={`company-monogram company-monogram--${size} ${showLogo ? "company-monogram--logo" : ""} ${className}`}
      style={{ "--monogram-hue": companyHueVar(name) } as CSSProperties}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={logoUrl(domain, theme)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => {
            markLogoFailed(domain);
            setBroken(domain);
          }}
        />
      ) : (
        monogram(name)
      )}
    </span>
  );
}
