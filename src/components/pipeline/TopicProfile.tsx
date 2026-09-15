import { useMemo, useState } from "react";
import { TIME_WINDOWS, type CompanyQuestion, type QuestionTimeWindow } from "../../lib/companyQuestions";
import { computeTopicScores } from "../../lib/topicProfile";
import { TopicChart } from "../shared/TopicChart";

interface TopicProfileProps {
  companyName: string;
  questions: CompanyQuestion[];
}

export function TopicProfile({ companyName, questions }: TopicProfileProps) {
  const [timeWindow, setTimeWindow] = useState<QuestionTimeWindow>("all_time");

  const scores = useMemo(() => computeTopicScores(questions, timeWindow), [questions, timeWindow]);

  return (
    <div className="topic-profile">
      <div className="topic-profile__title-row">
        <h3 className="card__title">Topic Chart</h3>
      </div>

      <div className="topic-profile__header">
        <p className="topic-profile__description">
          A weighted map of the concepts behind {companyName}&rsquo;s problem set — built from every synced
          question&rsquo;s topic tags, difficulty, and appearance frequency.
        </p>
        <select
          className="stage-filter__select topic-profile__window-select"
          value={timeWindow}
          onChange={(e) => setTimeWindow(e.target.value as QuestionTimeWindow)}
          aria-label="Filter topic profile by time window"
        >
          {TIME_WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      {scores.length === 0 ? (
        <p className="topic-profile__empty">No topic data for this filter.</p>
      ) : (
        <TopicChart scores={scores} />
      )}
    </div>
  );
}
