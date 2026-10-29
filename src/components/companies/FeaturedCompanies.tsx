import type { CSSProperties } from "react";
import { getCompanyQuestions } from "../../lib/companyQuestions";
import { companyHueVar } from "../../lib/companyColors";
import type { CompanyStats } from "../../lib/companyStats";
import { CompanyMonogram } from "./CompanyMonogram";

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
  // From useCompanyStats; null while loading.
  stats: Map<string, CompanyStats> | null;
  // With a LeetCode account the tile meter shows your solved %, otherwise
  // the company's easy/medium/hard mix.
  hasLeetCode: boolean;
}

// A selected company that's neither pinned nor featured takes the first slot
// (bumping the last featured tile) so the grid always shows where you are;
// pinned companies come next, featured ones fill the rest. Pins beyond the
// grid size grow it rather than being hidden.
export function buildTiles(companies: string[], pinned: string[], selected: string | null): string[] {
  const available = new Set(companies);
  const pins = pinned.filter((name) => available.has(name));
  const pinSet = new Set(pins);
  const featured = FEATURED.map((c) => c.name).filter((name) => available.has(name) && !pinSet.has(name));
  const visiting = selected && !pinSet.has(selected) && !featured.includes(selected) ? selected : null;
  const fill = Math.max(0, GRID_SIZE - pins.length - (visiting ? 1 : 0));
  return [...(visiting ? [visiting] : []), ...pins, ...featured.slice(0, fill)];
}

function formatPercent(part: number, whole: number) {
  if (whole === 0 || part === 0) return "0%";
  const pct = (part / whole) * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

function TileStats({ stats, hasLeetCode }: { stats: CompanyStats | null | undefined; hasLeetCode: boolean }) {
  // undefined = still loading; null = loaded but no row for this company.
  if (stats === undefined) {
    return (
      <>
        <span className="featured-companies__stats">
          <span className="featured-companies__skeleton" style={{ width: "70%" }} />
        </span>
        <span className="featured-companies__meter">
          <span className="featured-companies__skeleton" style={{ width: "100%" }} />
        </span>
      </>
    );
  }
  if (!stats) return <span className="featured-companies__stats">No question data yet</span>;

  return (
    <>
      <span className="featured-companies__stats">
        <span>
          <b>{stats.total.toLocaleString()}</b> questions
        </span>
        {stats.hot > 0 && (
          <span className="featured-companies__hot">
            <span className="featured-companies__hot-dot" aria-hidden="true" />
            <b>{stats.hot.toLocaleString()}</b> this month
          </span>
        )}
      </span>
      {hasLeetCode ? (
        <span className="featured-companies__meter" title={`${stats.solved} of ${stats.total} solved`}>
          <span className="featured-companies__bar">
            <span
              className="featured-companies__bar-fill"
              style={{ width: `${stats.total ? (stats.solved / stats.total) * 100 : 0}%` }}
            />
          </span>
          <span className="featured-companies__meter-label">{formatPercent(stats.solved, stats.total)} solved</span>
        </span>
      ) : (
        <span
          className="featured-companies__meter"
          title={`${stats.easy} easy, ${stats.medium} medium, ${stats.hard} hard`}
        >
          <span className="featured-companies__bar featured-companies__bar--mix">
            <span className="featured-companies__mix featured-companies__mix--easy" style={{ flexGrow: stats.easy }} />
            <span className="featured-companies__mix featured-companies__mix--medium" style={{ flexGrow: stats.medium }} />
            <span className="featured-companies__mix featured-companies__mix--hard" style={{ flexGrow: stats.hard }} />
          </span>
          <span className="featured-companies__meter-label">E / M / H</span>
        </span>
      )}
    </>
  );
}

export function FeaturedCompanies({ companies, pinned, selected, onSelect, stats, hasLeetCode }: FeaturedCompaniesProps) {
  const tiles = buildTiles(companies, pinned, selected);
  const pinSet = new Set(pinned);
  const compact = !!selected;

  return (
    <div className={`featured-companies ${compact ? "featured-companies--compact" : ""}`}>
      {tiles.map((name) => {
        const isActive = name === selected;
        const isPinned = pinSet.has(name);
        return (
          <button
            key={name}
            type="button"
            className={`featured-companies__tile ${isActive ? "featured-companies__tile--active" : ""}`}
            style={{ "--tile-hue": companyHueVar(name) } as CSSProperties}
            // Clicking the active tile deselects it, back to the full grid.
            onClick={() => onSelect(isActive ? null : name)}
            // Warm the cache on intent so the click lands on already-loaded data.
            onPointerEnter={() => void getCompanyQuestions(name)}
            onFocus={() => void getCompanyQuestions(name)}
            aria-pressed={isActive}
          >
            <span className="featured-companies__head">
              <CompanyMonogram name={name} size={compact ? "sm" : "md"} />
              <span className="featured-companies__name">{name}</span>
              {isPinned ? (
                <PinIcon className="featured-companies__pin" aria-label="Pinned" />
              ) : (
                FAANG.has(name) && <span className="featured-companies__badge">FAANG</span>
              )}
            </span>
            {!compact && (
              <TileStats
                stats={stats ? (stats.get(name.toLowerCase()) ?? null) : undefined}
                hasLeetCode={hasLeetCode}
              />
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
