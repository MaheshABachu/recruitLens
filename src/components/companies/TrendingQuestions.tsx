import { useTrendingQuestions } from "../../hooks/useTrendingQuestions";
import { CompanyMonogram } from "./CompanyMonogram";

interface TrendingQuestionsProps {
  solvedSlugs: Set<string>;
  // Clicking a company chip opens that company.
  onSelectCompany: (company: string) => void;
}

const ROW_COUNT = 10;

// Shown under the company grid before a company is picked: the questions the
// most companies asked in the last 30 days (trending_questions SQL function).
export function TrendingQuestions({ solvedSlugs, onSelectCompany }: TrendingQuestionsProps) {
  const questions = useTrendingQuestions(ROW_COUNT);

  if (questions && questions.length === 0) return null;

  return (
    <section className="trending" aria-labelledby="trending-title">
      <div className="trending__header">
        <h2 id="trending-title" className="trending__title">
          Asked the most this month
        </h2>
        <p className="trending__subtitle">Questions the most companies asked in the last 30 days. Pick a company above for its full list.</p>
      </div>

      <ol className="trending__list">
        {(questions ?? Array.from({ length: ROW_COUNT }, () => null)).map((q, index) => {
          if (!q) {
            return (
              <li key={index} className="trending__row trending__row--loading" aria-hidden="true">
                <span className="trending__rank">{index + 1}</span>
                <span className="featured-companies__skeleton" style={{ width: `${40 + ((index * 17) % 35)}%` }} />
              </li>
            );
          }
          const isSolved = solvedSlugs.has(q.slug);
          const extra = q.company_count - q.companies.length;
          return (
            <li key={q.slug} className={`trending__row ${isSolved ? "trending__row--solved" : ""}`}>
              <span className="trending__rank">{index + 1}</span>
              <span className={`tag company-questions__difficulty company-questions__difficulty--${q.difficulty ?? "unknown"}`}>
                {q.difficulty ?? "?"}
              </span>
              <a className="trending__name" href={q.leetcode_url} target="_blank" rel="noopener noreferrer">
                {q.title}
              </a>
              {isSolved && (
                <span className="trending__solved" title="Solved">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Solved" role="img">
                    <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              <span className="trending__companies">
                {q.companies.map((company) => (
                  <button
                    key={company}
                    type="button"
                    className="trending__company"
                    onClick={() => onSelectCompany(company)}
                    title={`Open ${company}`}
                  >
                    <CompanyMonogram name={company} size="sm" />
                    <span className="trending__company-name">{company}</span>
                  </button>
                ))}
                {extra > 0 && <span className="trending__more">+{extra}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
