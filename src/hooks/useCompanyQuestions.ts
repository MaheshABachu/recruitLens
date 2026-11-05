import { useCallback } from "react";
import { useSwr } from "../lib/swrCache";
import {
  COMPANY_QUESTIONS_MAX_AGE_MS,
  companyQuestionsKey,
  fetchCompanyQuestions,
  type CompanyQuestion,
} from "../lib/companyQuestions";

const EMPTY: CompanyQuestion[] = [];

// Cached across tab switches and visits (src/lib/swrCache.ts).
export function useCompanyQuestions(companyName: string | undefined) {
  const loader = useCallback(() => fetchCompanyQuestions(companyName ?? ""), [companyName]);
  const { data, loading } = useSwr(
    companyName ? companyQuestionsKey(companyName) : null,
    loader,
    COMPANY_QUESTIONS_MAX_AGE_MS,
  );
  return { questions: data ?? EMPTY, loading };
}
