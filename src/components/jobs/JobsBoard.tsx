import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useJobPostings } from "../../hooks/useJobPostings";
import { useLcCompanies } from "../../hooks/useLcCompanies";
import { useCompanyStats } from "../../hooks/useCompanyStats";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { JobRow, daysSince } from "./JobRow";
import type { JobPosting } from "../../types/jobPosting";

type SortBy = "date" | "company";

const ALL = "All";
const PAGE_STEP = 50;
const WEEK = 7;

// Yes/no filters shown as toggle chips. Each one narrows the list when on.
const TOGGLES = {
  // Only Simplify labels these, and only on a handful of postings, so this
  // hides known blockers rather than promising sponsorship.
  visa: {
    label: "Hide visa blockers",
    test: (p: JobPosting) => !p.noSponsorship && !p.requiresUsCitizenship,
  },
  faang: { label: "FAANG+", test: (p: JobPosting) => p.isFaang },
  salary: { label: "Has salary", test: (p: JobPosting) => !!p.salary },
  newThisWeek: {
    label: "New this week",
    test: (p: JobPosting) => {
      const days = daysSince(p.datePosted);
      return days !== null && days <= WEEK;
    },
  },
} as const;
type ToggleKey = keyof typeof TOGGLES;
const TOGGLE_KEYS = Object.keys(TOGGLES) as ToggleKey[];

// Date sections for the "Newest" sort, in display order.
function dateBucket(days: number | null) {
  if (days === null) return "Date unknown";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= WEEK) return "This week";
  return "Earlier";
}

function filterClass(isActive: boolean) {
  return `stage-filter__select ${isActive ? "stage-filter__select--active" : ""}`;
}

interface JobsBoardProps {
  // Opens a company on the Company Questions tab.
  onPrepCompany: (company: string) => void;
}

export function JobsBoard({ onPrepCompany }: JobsBoardProps) {
  const { postings, loading } = useJobPostings();
  const { companies: bankCompanies } = useLcCompanies();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [workModel, setWorkModel] = useState(ALL);
  const [toggles, setToggles] = useState<Set<ToggleKey>>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  const categories = useMemo(
    () => [...new Set(postings.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [postings],
  );
  const sources = useMemo(() => [...new Set(postings.flatMap((p) => p.sources))].sort(), [postings]);
  const workModels = useMemo(
    () => [...new Set(postings.map((p) => p.workModel).filter((w): w is string => !!w))].sort(),
    [postings],
  );

  const summary = useMemo(() => {
    let newThisWeek = 0;
    for (const p of postings) if (TOGGLES.newThisWeek.test(p)) newThisWeek += 1;
    return { total: postings.length, newThisWeek, companies: new Set(postings.map((p) => p.company)).size };
  }, [postings]);

  // Job lists spell company names their own way; match the question bank
  // case-insensitively and keep its canonical spelling for the Prep link.
  const bankByLower = useMemo(() => new Map(bankCompanies.map((name) => [name.toLowerCase(), name])), [bankCompanies]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = postings.filter((p) => {
      if (category !== ALL && p.category !== category) return false;
      if (source !== ALL && !p.sources.includes(source)) return false;
      if (workModel !== ALL && p.workModel !== workModel) return false;
      for (const key of toggles) if (!TOGGLES[key].test(p)) return false;
      if (q && !p.company.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortBy === "date"
        ? (b.datePosted ?? "").localeCompare(a.datePosted ?? "")
        : a.company.localeCompare(b.company),
    );
  }, [postings, search, category, source, workModel, toggles, sortBy]);

  // Filters changed the result set out from under the current page — start over.
  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [search, category, source, workModel, toggles, sortBy]);

  const visibleRows = rows.slice(0, visibleCount);

  // Question counts for the Prep chips, only for companies on screen.
  const visibleBankNames = useMemo(
    () => [
      ...new Set(
        visibleRows
          .map((p) => bankByLower.get(p.company.toLowerCase()))
          .filter((name): name is string => !!name),
      ),
    ],
    [visibleRows, bankByLower],
  );
  const prepStats = useCompanyStats(visibleBankNames, null);

  const hasFilters =
    search.trim() !== "" || category !== ALL || source !== ALL || workModel !== ALL || toggles.size > 0;

  function clearFilters() {
    setSearch("");
    setCategory(ALL);
    setSource(ALL);
    setWorkModel(ALL);
    setToggles(new Set());
  }

  function toggle(key: ToggleKey) {
    setToggles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderRow(p: JobPosting) {
    const prepCompany = bankByLower.get(p.company.toLowerCase()) ?? null;
    return (
      <JobRow
        key={p.id}
        posting={p}
        prepCompany={prepCompany}
        prepCount={prepCompany ? prepStats?.get(prepCompany.toLowerCase())?.total : undefined}
        onPrep={onPrepCompany}
      />
    );
  }

  // "Newest" sort groups rows under date headers; rows are already in date
  // order, so a new section starts whenever the bucket changes.
  let list: ReactNode;
  if (sortBy === "date") {
    const sections: { label: string; rows: JobPosting[] }[] = [];
    for (const p of visibleRows) {
      const label = dateBucket(daysSince(p.datePosted));
      const last = sections[sections.length - 1];
      if (last?.label === label) last.rows.push(p);
      else sections.push({ label, rows: [p] });
    }
    // Header counts cover the whole filtered set, not just the loaded page.
    const totals = new Map<string, number>();
    for (const p of rows) {
      const label = dateBucket(daysSince(p.datePosted));
      totals.set(label, (totals.get(label) ?? 0) + 1);
    }
    list = sections.map((section) => (
      <section key={section.label} className="jobs-board__section" aria-label={section.label}>
        <h2 className="jobs-board__section-title">
          {section.label}
          <span>{(totals.get(section.label) ?? section.rows.length).toLocaleString()} roles</span>
        </h2>
        <ul className="jobs-board__list">{section.rows.map(renderRow)}</ul>
      </section>
    ));
  } else {
    list = <ul className="jobs-board__list">{visibleRows.map(renderRow)}</ul>;
  }

  return (
    <main className="jobs-board">
      <div className="jobs-board__header">
        <h1 className="jobs-board__title">Jobs</h1>
        {!loading && (
          <p className="jobs-board__summary">
            <span>
              <b className="jobs-board__summary-total">{summary.total.toLocaleString()}</b> open roles
            </span>
            <span>
              <b className="jobs-board__summary-new">{summary.newThisWeek.toLocaleString()}</b> new this week
            </span>
            <span>
              <b className="jobs-board__summary-companies">{summary.companies.toLocaleString()}</b> companies
            </span>
          </p>
        )}
      </div>

      <div className="jobs-board__filters">
        <input
          type="text"
          className="company-search__input jobs-board__search"
          placeholder="Search company or title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search postings"
        />

        <select
          className={filterClass(category !== ALL)}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value={ALL}>All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className={filterClass(source !== ALL)}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Filter by source"
        >
          <option value={ALL}>All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className={filterClass(sortBy !== "date")}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort postings"
        >
          <option value="date">Sort: Newest</option>
          <option value="company">Sort: Company</option>
        </select>
      </div>

      <div className="jobs-board__toggles">
        {workModels.length > 0 && (
          <div className="jobs-board__segmented" role="group" aria-label="Work model">
            {[ALL, ...workModels].map((value) => (
              <button
                key={value}
                type="button"
                className={`jobs-board__segment ${workModel === value ? "jobs-board__segment--active" : ""}`}
                aria-pressed={workModel === value}
                onClick={() => setWorkModel(value)}
              >
                {value === ALL ? "Any location" : value}
              </button>
            ))}
          </div>
        )}
        {TOGGLE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`jobs-board__toggle jobs-board__toggle--${key} ${toggles.has(key) ? "jobs-board__toggle--on" : ""}`}
            aria-pressed={toggles.has(key)}
            onClick={() => toggle(key)}
          >
            {TOGGLES[key].label}
          </button>
        ))}
        {hasFilters && (
          <button type="button" className="jobs-board__clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {!loading && (
        <span className="jobs-board__count">
          {rows.length.toLocaleString()} of {postings.length.toLocaleString()} postings
        </span>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="jobs-board__empty">
          <p>No roles match these filters. Try removing one.</p>
          {hasFilters && (
            <button type="button" className="jobs-board__clear" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {list}
          {visibleCount < rows.length && (
            <button type="button" className="jobs-board__load-more" onClick={() => setVisibleCount((c) => c + PAGE_STEP)}>
              Load more ({(rows.length - visibleCount).toLocaleString()} remaining)
            </button>
          )}
        </>
      )}
    </main>
  );
}
