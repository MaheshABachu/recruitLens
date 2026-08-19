import type { CompanyQuestion, QuestionDifficulty, QuestionTimeWindow } from "./companyQuestions";

export const DIFFICULTY_WEIGHT: Record<QuestionDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

export interface TopicScore {
  topic: string;
  score: number;
}

// raw(t) = Σ ( freq(p)/100 × difficultyWeight(p) ) for every problem p tagged
// with topic t, scoped to the given time window. score(t) = raw(t) / max(raw) × 100.
// A problem tagged with multiple topics contributes its full freq/100×weight
// to each of its topics independently. Sorted descending by score, which also
// drives the radar chart's clockwise-from-top axis order.
export function computeTopicScores(questions: CompanyQuestion[], timeWindow: QuestionTimeWindow): TopicScore[] {
  const raw = new Map<string, number>();
  for (const q of questions) {
    if (q.time_window !== timeWindow) continue;
    const weight = q.difficulty ? DIFFICULTY_WEIGHT[q.difficulty] : 1;
    const contribution = (q.frequency_score / 100) * weight;
    for (const topic of q.topics) {
      raw.set(topic, (raw.get(topic) ?? 0) + contribution);
    }
  }

  const maxRaw = Math.max(0, ...raw.values());
  if (maxRaw === 0) return [];

  return [...raw.entries()]
    .map(([topic, r]) => ({ topic, score: (r / maxRaw) * 100 }))
    .sort((a, b) => b.score - a.score);
}
