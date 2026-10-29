// Each company gets one of the --hue-* tokens from tokens.css. The picked
// company's hue is set as --company-hue on the Companies tab, and everything
// tinted there (tiles, progress arc, radar, frequency bars) derives from it.

export const COMPANY_HUES = ["cobalt", "violet", "teal", "rose", "sky", "olive", "orange", "plum"] as const;
export type CompanyHue = (typeof COMPANY_HUES)[number];

// Featured companies get a hand-picked hue (brand-adjacent where it's natural,
// and spread so neighbours in the default 4x4 grid differ). Everyone else
// gets a stable hash-based one.
const FIXED: Record<string, CompanyHue> = {
  meta: "cobalt",
  apple: "plum",
  amazon: "orange",
  netflix: "rose",
  google: "teal",
  microsoft: "sky",
  nvidia: "olive",
  databricks: "orange",
  openai: "plum",
  uber: "cobalt",
  airbnb: "rose",
  stripe: "violet",
  linkedin: "sky",
  bloomberg: "olive",
  tiktok: "teal",
  salesforce: "cobalt",
};

export function companyHue(name: string): CompanyHue {
  const key = name.trim().toLowerCase();
  if (FIXED[key]) return FIXED[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return COMPANY_HUES[Math.abs(hash) % COMPANY_HUES.length];
}

export function companyHueVar(name: string) {
  return `var(--hue-${companyHue(name)})`;
}

// Two letters so companies sharing an initial stay distinguishable
// (Apple "Ap" / Amazon "Am"); multi-word names use initials ("Goldman Sachs" → "GS").
export function monogram(name: string) {
  const words = name.trim().split(/[\s\-_.&]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const word = words[0] ?? "?";
  return word[0].toUpperCase() + (word[1] ?? "").toLowerCase();
}
