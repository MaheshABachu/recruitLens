import { useMemo, useState } from "react";
import { TIME_WINDOWS, type CompanyQuestion, type QuestionDifficulty, type QuestionTimeWindow } from "../../lib/companyQuestions";

interface CompanyQuestionsProps {
  questions: CompanyQuestion[];
  solvedSlugs: Set<string>;
  /**
   * Controlled time window. When passed, the built-in window <select> is
   * hidden and the caller owns the choice — the Companies tab drives this
   * list and its topic chart from one shared control.
   */
  timeWindow?: QuestionTimeWindow;
}

type SortBy = "frequency" | "name";
type SolvedFilter = "all" | "solved" | "unsolved";

const DIFFICULTIES: { value: QuestionDifficulty | "all"; label: string }[] = [
  { value: "all", label: "Difficulty" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export function CompanyQuestions({ questions, solvedSlugs, timeWindow: controlledWindow }: CompanyQuestionsProps) {
  const [ownWindow, setOwnWindow] = useState<QuestionTimeWindow>("all_time");
  const timeWindow = controlledWindow ?? ownWindow;
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | "all">("all");
  const [solvedFilter, setSolvedFilter] = useState<SolvedFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("frequency");

  const rows = useMemo(() => {
    // Each problem has one row per time_window (same slug, different
    // frequency_score) — the time-window dropdown selects which of those
    // rows to show, it isn't an additional filter on top of "all".
    const filtered = questions.filter((q) => {
      if (q.time_window !== timeWindow) return false;
      if (difficulty !== "all" && q.difficulty !== difficulty) return false;
      const isSolved = solvedSlugs.has(q.problem_slug);
      if (solvedFilter === "solved" && !isSolved) return false;
      if (solvedFilter === "unsolved" && isSolved) return false;
      return true;
    });
    return filtered.sort((a, b) =>
      sortBy === "frequency" ? b.frequency_score - a.frequency_score : a.problem_name.localeCompare(b.problem_name),
    );
  }, [questions, timeWindow, difficulty, solvedFilter, sortBy, solvedSlugs]);

  return (
    <div className="company-questions">
      <div className="company-questions__filters">
        {controlledWindow === undefined && (
          <select
            className="stage-filter__select"
            value={timeWindow}
            onChange={(e) => setOwnWindow(e.target.value as QuestionTimeWindow)}
            aria-label="Filter by time window"
          >
            {TIME_WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        )}

        <select
          className="stage-filter__select"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty | "all")}
          aria-label="Filter by difficulty"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        <select
          className="stage-filter__select"
          value={solvedFilter}
          onChange={(e) => setSolvedFilter(e.target.value as SolvedFilter)}
          aria-label="Filter by solved status"
        >
          <option value="all">All</option>
          <option value="solved">Solved</option>
          <option value="unsolved">Unsolved</option>
        </select>

        <select
          className="stage-filter__select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort questions"
        >
          <option value="frequency">Frequency</option>
          <option value="name">Name</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="company-questions__empty">No questions for this filter.</p>
      ) : (
        <ul className="company-questions__list">
          {rows.map((q) => {
            const isSolved = solvedSlugs.has(q.problem_slug);
            return (
              <li key={q.problem_slug} className="company-questions__row">
                <span
                  className="company-questions__solved"
                  aria-label={isSolved ? "Solved" : "Not solved"}
                  title={isSolved ? "Solved" : undefined}
                >
                  {isSolved && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M5 12.5 10 17.5 19 7"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className={`tag company-questions__difficulty company-questions__difficulty--${q.difficulty ?? "unknown"}`}>
                  {q.difficulty ?? "?"}
                </span>
                <span className="company-questions__main">
                  <a
                    className="company-questions__name"
                    href={q.leetcode_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {q.problem_name}
                  </a>
                  {q.topics.length > 0 && (
                    <span className="company-questions__topics" title={q.topics.join(", ")}>
                      {q.topics.join(", ")}
                    </span>
                  )}
                </span>
                <span className="company-questions__frequency">{q.frequency_score.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
