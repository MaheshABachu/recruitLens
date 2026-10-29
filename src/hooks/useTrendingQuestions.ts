import { useEffect, useState } from "react";
import { getTrendingQuestions, type TrendingQuestion } from "../lib/companyStats";

// Same fetch-on-mount pattern as useLcCompanies. null while loading.
export function useTrendingQuestions(maxRows = 10) {
  const [questions, setQuestions] = useState<TrendingQuestion[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTrendingQuestions(maxRows).then((rows) => {
      if (!cancelled) setQuestions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [maxRows]);

  return questions;
}
