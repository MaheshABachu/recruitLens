import { useEffect, useState } from "react";
import { getCachedCompanyQuestions, getCompanyQuestions, type CompanyQuestion } from "../lib/companyQuestions";

export function useCompanyQuestions(companyName: string | undefined) {
  const [questions, setQuestions] = useState<CompanyQuestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyName) {
      setQuestions([]);
      return;
    }
    const cached = getCachedCompanyQuestions(companyName);
    if (cached) {
      setQuestions(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCompanyQuestions(companyName).then((rows) => {
      if (!cancelled) {
        setQuestions(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [companyName]);

  return { questions, loading };
}
