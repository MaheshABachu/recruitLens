import { RadarChart } from "./RadarChart";
import type { TopicScore } from "../../lib/topicProfile";

const RADAR_TOPIC_LIMIT = 16;

interface TopicChartProps {
  scores: TopicScore[];
  /** "row" puts the bar list beside the radar (Company detail); "column" stacks it under (Companies tab). */
  layout?: "row" | "column";
}

// The radar + bar-list pair, shared by the pipeline's TopicProfile card and
// the Companies tab. Presentational only — the time window is resolved by the
// caller, which is what lets the Companies tab drive both this and the
// question list from a single control.
export function TopicChart({ scores, layout = "row" }: TopicChartProps) {
  // Radar stays readable with a fixed cap; the bar list still shows every topic.
  const radarScores = scores.slice(0, RADAR_TOPIC_LIMIT);

  return (
    <div className={`topic-profile__body topic-profile__body--${layout}`}>
      <div className="topic-profile__radar">
        <RadarChart axes={radarScores.map((s) => ({ label: s.topic, value: s.score }))} />
      </div>
      <div className="topic-profile__bars-wrap">
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
  );
}
