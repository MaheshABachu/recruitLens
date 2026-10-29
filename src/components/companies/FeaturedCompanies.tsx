import { getCompanyQuestions } from "../../lib/companyQuestions";

// Quick-pick matrix of the companies most people prep for first. Names must
// match lc_companies.name exactly (case-insensitive lookup downstream); any
// that aren't in the loaded bank are dropped rather than rendered dead.
const FEATURED: { name: string; isFaang?: boolean }[] = [
  { name: "Meta", isFaang: true },
  { name: "Apple", isFaang: true },
  { name: "Amazon", isFaang: true },
  { name: "Netflix", isFaang: true },
  { name: "Google", isFaang: true },
  { name: "Microsoft" },
  { name: "Nvidia" },
  { name: "Databricks" },
  { name: "OpenAI" },
  { name: "Uber" },
  { name: "Airbnb" },
  { name: "Stripe" },
  { name: "LinkedIn" },
  { name: "Bloomberg" },
  { name: "TikTok" },
  { name: "Salesforce" },
];

const FAANG = new Set(FEATURED.filter((c) => c.isFaang).map((c) => c.name));
const GRID_SIZE = FEATURED.length;

interface FeaturedCompaniesProps {
  companies: string[];
  pinned: string[];
  selected: string | null;
  onSelect: (company: string | null) => void;
}

// A selected company that's neither pinned nor featured takes the first slot
// (bumping the last featured tile) so the grid always shows where you are;
// pinned companies come next, featured ones fill the rest. Pins beyond the
// grid size grow it rather than being hidden.
function buildTiles(companies: string[], pinned: string[], selected: string | null): string[] {
  const available = new Set(companies);
  const pins = pinned.filter((name) => available.has(name));
  const pinSet = new Set(pins);
  const featured = FEATURED.map((c) => c.name).filter((name) => available.has(name) && !pinSet.has(name));
  const visiting = selected && !pinSet.has(selected) && !featured.includes(selected) ? selected : null;
  const fill = Math.max(0, GRID_SIZE - pins.length - (visiting ? 1 : 0));
  return [...(visiting ? [visiting] : []), ...pins, ...featured.slice(0, fill)];
}

export function FeaturedCompanies({ companies, pinned, selected, onSelect }: FeaturedCompaniesProps) {
  const tiles = buildTiles(companies, pinned, selected);
  const pinSet = new Set(pinned);

  return (
    <div className={`featured-companies ${selected ? "featured-companies--compact" : ""}`}>
      {tiles.map((name) => {
        const isActive = name === selected;
        const isPinned = pinSet.has(name);
        return (
          <button
            key={name}
            type="button"
            className={`featured-companies__tile ${isActive ? "featured-companies__tile--active" : ""}`}
            // Clicking the active tile deselects it, back to the full grid.
            onClick={() => onSelect(isActive ? null : name)}
            // Warm the cache on intent so the click lands on already-loaded data.
            onPointerEnter={() => void getCompanyQuestions(name)}
            onFocus={() => void getCompanyQuestions(name)}
            aria-pressed={isActive}
          >
            <span className="featured-companies__name">{name}</span>
            {isPinned ? (
              <PinIcon className="featured-companies__pin" aria-label="Pinned" />
            ) : (
              FAANG.has(name) && <span className="featured-companies__badge">FAANG</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PinIcon({ className, filled = true, ...rest }: { className?: string; filled?: boolean; "aria-label"?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      role={rest["aria-label"] ? "img" : undefined}
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
    >
      <path d="M9 3h6l-1 6 4 4v2h-5v6l-1 1-1-1v-6H6v-2l4-4-1-6z" />
    </svg>
  );
}
