import { useMemo, useState } from "react";
import { TIME_WINDOWS, type CompanyQuestion, type QuestionTimeWindow } from "../../lib/companyQuestions";
import { computeTopicScores } from "../../lib/topicProfile";
import { RadarChart } from "./RadarChart";

const RADAR_TOPIC_LIMIT = 16;

interface TopicProfileProps {
  companyName: string;
  questions: CompanyQuestion[];
  expanded: boolean;
  onToggleExpanded: () => void;
}

export function TopicProfile({ companyName, questions, expanded, onToggleExpanded }: TopicProfileProps) {
  const [timeWindow, setTimeWindow] = useState<QuestionTimeWindow>("all_time");

  const scores = useMemo(() => computeTopicScores(questions, timeWindow), [questions, timeWindow]);
  // Radar stays readable with a fixed cap; the bar list (expanded view only) still shows every topic.
  const radarScores = scores.slice(0, RADAR_TOPIC_LIMIT);

  return (
    <div className="topic-profile">
      <div className="topic-profile__title-row">
        <h3 className="card__title">Topic Chart</h3>
        <button type="button" className="topic-profile__toggle" onClick={onToggleExpanded} aria-expanded={expanded}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* Always mounted (not conditionally rendered) so the reveal animates
          via CSS grid-template-rows instead of popping in/out. */}
      <div className={`topic-profile__expand ${expanded ? "topic-profile__expand--open" : ""}`}>
        <div className="topic-profile__expand-inner">
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
        </div>
      </div>

      {scores.length === 0 ? (
        <p className="topic-profile__empty">No topic data for this filter.</p>
      ) : (
        <div className="topic-profile__body">
          <div className="topic-profile__radar">
            <RadarChart axes={radarScores.map((s) => ({ label: s.topic, value: s.score }))} />
          </div>
          <div className={`topic-profile__bars-wrap ${expanded ? "topic-profile__bars-wrap--open" : ""}`}>
            <div className="topic-profile__bars-inner">
              <ul className="topic-profile__bars">
                {scores.map((s) => (
                  <li key={s.topic} className="topic-profile__bar-row">
                    <span className="topic-profile__bar-label">{s.topic}</span>
                    <span className="topic-profile__bar-track">
                      <span className="topic-profile__bar-fill" style={{ width: `${s.score}%` }} />
                    </span>
                    <span className="topic-profile__bar-score">{Math.round(s.score)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
