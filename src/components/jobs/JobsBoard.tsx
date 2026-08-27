import { useEffect, useMemo, useState } from "react";
import { useJobPostings } from "../../hooks/useJobPostings";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import type { JobPosting } from "../../types/jobPosting";

type SortBy = "date" | "company";

const ALL = "All";
const PAGE_STEP = 50;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function JobsBoard() {
  const { postings, loading } = useJobPostings();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);

  const categories = useMemo(
    () => [...new Set(postings.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [postings],
  );
  const sources = useMemo(() => [...new Set(postings.flatMap((p) => p.sources))].sort(), [postings]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = postings.filter((p) => {
      if (category !== ALL && p.category !== category) return false;
      if (source !== ALL && !p.sources.includes(source)) return false;
      if (q && !p.company.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortBy === "date"
        ? (b.datePosted ?? "").localeCompare(a.datePosted ?? "")
        : a.company.localeCompare(b.company),
    );
  }, [postings, search, category, source, sortBy]);

  // Filters changed the result set out from under the current page — start over.
  useEffect(() => {
    setVisibleCount(PAGE_STEP);
  }, [search, category, source, sortBy]);

  const visibleRows = rows.slice(0, visibleCount);

  return (
    <main className="jobs-board">
      <div className="jobs-board__header">
        <h1 className="jobs-board__title">Jobs</h1>
        <span className="jobs-board__count">{rows.length} of {postings.length} postings</span>
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
          className="stage-filter__select"
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
          className="stage-filter__select"
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
          className="stage-filter__select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort postings"
        >
          <option value="date">Sort: Newest</option>
          <option value="company">Sort: Company</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <p className="jobs-board__empty">No postings match these filters.</p>
      ) : (
        <>
          <div className="jobs-board__list">
            <div className="jobs-board__row jobs-board__row--header">
              <span>Role</span>
              <span>Company</span>
              <span>Location</span>
              <span>Date &amp; source</span>
            </div>
            {visibleRows.map((p) => (
              <JobRow key={p.id} posting={p} />
            ))}
          </div>
          {visibleCount < rows.length && (
            <button type="button" className="jobs-board__load-more" onClick={() => setVisibleCount((c) => c + PAGE_STEP)}>
              Load more ({rows.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}
    </main>
  );
}

function JobRow({ posting }: { posting: JobPosting }) {
  return (
    <div className="jobs-board__row">
      <span className="jobs-board__col jobs-board__col--role">
        <a href={posting.url} target="_blank" rel="noopener noreferrer" className="jobs-board__job-title">
          {posting.title}
        </a>
        {(posting.isFaang || posting.salary) && (
          <span className="jobs-board__role-tags">
            {posting.isFaang && <span className="tag tag--accent">FAANG+</span>}
            {posting.salary && <span className="jobs-board__salary">{posting.salary}</span>}
          </span>
        )}
      </span>
      <span className="jobs-board__col jobs-board__col--company">
        {posting.companyUrl ? (
          <a href={posting.companyUrl} target="_blank" rel="noopener noreferrer" className="jobs-board__company">
            {posting.company}
          </a>
        ) : (
          posting.company
        )}
      </span>
      <span className="jobs-board__col jobs-board__col--location">{posting.location ?? "—"}</span>
      <span className="jobs-board__col jobs-board__col--date">
        <span className="jobs-board__date">{formatDate(posting.datePosted)}</span>
        <span className="jobs-board__sources" title={posting.sources.join(", ")}>
          {posting.sources.join(", ")}
        </span>
      </span>
    </div>
  );
}
