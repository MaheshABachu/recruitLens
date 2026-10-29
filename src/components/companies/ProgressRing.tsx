import { useEffect, useState } from "react";
import type { QuestionDifficulty } from "../../lib/companyQuestions";

export interface DifficultyTally {
  solved: number;
  total: number;
}

interface ProgressRingProps {
  solved: number;
  total: number;
  byDifficulty: Record<QuestionDifficulty, DifficultyTally>;
}

// A 3/4 arc (gap at the bottom), same shape as LeetCode's own progress dial.
// The dash geometry is precomputed against the fixed r=56 viewBox below —
// rotating -135° puts the arc's start at the lower-left, so it fills clockwise.
const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE * 0.75;

const TILES: { difficulty: QuestionDifficulty; label: string }[] = [
  { difficulty: "easy", label: "Easy" },
  { difficulty: "medium", label: "Med." },
  { difficulty: "hard", label: "Hard" },
];

export function ProgressRing({ solved, total, byDifficulty }: ProgressRingProps) {
  const ratio = total === 0 ? 0 : solved / total;
  const remaining = Math.max(0, total - solved);
  // Start the arc empty and let the CSS transition sweep it to its value.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="progress-ring">
      <div className="progress-ring__dial">
        <svg viewBox="0 0 140 140" className="progress-ring__svg" role="img" aria-label={`${solved} of ${total} solved`}>
          <g transform="rotate(135 70 70)">
            <circle
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              className="progress-ring__track"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            />
            <circle
              className="progress-ring__arc"
              cx="70"
              cy="70"
              r={RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${drawn ? ARC_LENGTH * ratio : 0} ${CIRCUMFERENCE}`}
            />
          </g>
        </svg>
        <div className="progress-ring__center">
          <p className="progress-ring__count">
            {solved}
            <span className="progress-ring__total">/{total}</span>
          </p>
          <p className="progress-ring__caption">Solved</p>
        </div>
        <p className="progress-ring__footnote">{remaining} remaining</p>
      </div>

      <div className="progress-ring__tiles">
        {TILES.map(({ difficulty, label }) => {
          const tally = byDifficulty[difficulty];
          return (
            <div key={difficulty} className={`progress-ring__tile progress-ring__tile--${difficulty}`}>
              <span className="progress-ring__tile-label">{label}</span>
              <span className="progress-ring__tile-value">
                {tally.solved}/{tally.total}
              </span>
              <span className="progress-ring__tile-bar" aria-hidden="true">
                <span
                  className="progress-ring__tile-fill"
                  style={{ width: `${tally.total ? (tally.solved / tally.total) * 100 : 0}%` }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
