import { useMemo, useState } from "react";
import { CompanyPicker } from "./CompanyPicker";
import { FeaturedCompanies, PinIcon } from "./FeaturedCompanies";
import { ProgressRing, type DifficultyTally } from "./ProgressRing";
import { CompanyQuestions } from "./CompanyQuestions";
import { LeetCodeSync, type LeetCodeSyncState } from "./LeetCodeSync";
import { TopicChart } from "../shared/TopicChart";
import { Card } from "../shared/Card";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { useLcCompanies } from "../../hooks/useLcCompanies";
import { useCompanyQuestions } from "../../hooks/useCompanyQuestions";
import { useLeetCodeSolvedSlugs } from "../../hooks/useLeetCodeSolvedSlugs";
import { useUserCompanies } from "../../hooks/useUserCompanies";
import { computeTopicScores } from "../../lib/topicProfile";
import type { CompanyQuestion, QuestionDifficulty, QuestionTimeWindow } from "../../lib/companyQuestions";

const EMPTY_TALLY: Record<QuestionDifficulty, DifficultyTally> = {
  easy: { solved: 0, total: 0 },
  medium: { solved: 0, total: 0 },
  hard: { solved: 0, total: 0 },
};

// Progress over the questions in the selected window only — the same set the
// list and the topic chart are showing, so the dial never counts problems the
// user can't see. Solved state comes from leetcode_solves, which is bounded by
// the sync's "most recent 20 accepted submissions" ceiling.
function tallyProgress(questions: CompanyQuestion[], timeWindow: QuestionTimeWindow, solvedSlugs: Set<string>) {
  const byDifficulty: Record<QuestionDifficulty, DifficultyTally> = {
    easy: { ...EMPTY_TALLY.easy },
    medium: { ...EMPTY_TALLY.medium },
    hard: { ...EMPTY_TALLY.hard },
  };
  let total = 0;
  let solved = 0;

  for (const q of questions) {
    if (q.time_window !== timeWindow) continue;
    total += 1;
    const isSolved = solvedSlugs.has(q.problem_slug);
    if (isSolved) solved += 1;
    if (q.difficulty) {
      byDifficulty[q.difficulty].total += 1;
      if (isSolved) byDifficulty[q.difficulty].solved += 1;
    }
  }

  return { total, solved, byDifficulty };
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CompaniesBoard({ leetCode }: { leetCode: LeetCodeSyncState }) {
  const solvedVersion = leetCode.lastChangedAt;
  const { companies, loading: companiesLoading } = useLcCompanies();
  const [selected, setSelected] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<QuestionTimeWindow>("all_time");

  const { questions, loading: questionsLoading } = useCompanyQuestions(selected ?? undefined);
  const solvedSlugs = useLeetCodeSolvedSlugs(solvedVersion);
  const { pinned, inProcess, togglePin, toggleInProcess } = useUserCompanies();
  const isPinned = !!selected && pinned.includes(selected);
  const isInProcess = !!selected && inProcess.has(selected);

  const scores = useMemo(() => computeTopicScores(questions, timeWindow), [questions, timeWindow]);
  const progress = useMemo(
    () => tallyProgress(questions, timeWindow, solvedSlugs),
    [questions, timeWindow, solvedSlugs],
  );

  return (
    <main className="companies-board">
      <div className="companies-board__header">
        <div className="companies-board__heading">
          <div className="companies-board__title-row">
            <h1 className="companies-board__title">{selected ?? "Company Questions"}</h1>
            {selected && (
              <button
                type="button"
                className={`pin-button ${isPinned ? "pin-button--active" : ""}`}
                onClick={() => togglePin(selected)}
                aria-pressed={isPinned}
                disabled={isInProcess}
                title={isInProcess ? "In-process companies stay pinned" : undefined}
              >
                <PinIcon filled={isPinned} />
                {isPinned ? "Pinned" : "Pin"}
              </button>
            )}
            {selected && (
              <button
                type="button"
                className={`pin-button ${isInProcess ? "pin-button--active" : ""}`}
                onClick={() => toggleInProcess(selected)}
                aria-pressed={isInProcess}
              >
                {isInProcess && <CheckIcon />}
                In process
              </button>
            )}
          </div>
          <span className="companies-board__count">
            {selected
              ? `${progress.total} question${progress.total === 1 ? "" : "s"} in this window`
              : `${companies.length} companies in the question bank`}
          </span>
        </div>

        <LeetCodeSync leetCode={leetCode} />

        <div className="companies-board__controls">
          <CompanyPicker companies={companies} selected={selected} onSelect={setSelected} />
        </div>
      </div>

      {companiesLoading ? (
        <LoadingSpinner />
      ) : (
        <FeaturedCompanies companies={companies} pinned={pinned} selected={selected} onSelect={setSelected} />
      )}

      {companiesLoading ? null : !selected ? (
        <p className="companies-board__empty">
          Pick a company above, or search the full bank, to see its question mix, topic profile, and your progress against it.
        </p>
      ) : questionsLoading ? (
        <LoadingSpinner />
      ) : questions.length === 0 ? (
        <p className="companies-board__empty">No LeetCode question data for {selected} yet.</p>
      ) : (
        <div className="companies-board__grid">
          <div className="companies-board__left">
            <Card title="Progress" className="companies-board__card">
              <ProgressRing
                solved={progress.solved}
                total={progress.total}
                byDifficulty={progress.byDifficulty}
              />
            </Card>

            <Card title="Topic Chart" className="companies-board__card">
              {scores.length === 0 ? (
                <p className="topic-profile__empty">No topic data for this window.</p>
              ) : (
                <TopicChart scores={scores} />
              )}
            </Card>
          </div>

          <Card title="All questions" className="companies-board__card companies-board__questions">
            <CompanyQuestions
              questions={questions}
              solvedSlugs={solvedSlugs}
              timeWindow={timeWindow}
              onTimeWindowChange={setTimeWindow}
            />
          </Card>
        </div>
      )}
    </main>
  );
}
