import { useEffect, useState } from "react";
import { getCompanyQuestions, type CompanyQuestion } from "../lib/companyQuestions";

export function useCompanyQuestions(companyName: string | undefined) {
  const [questions, setQuestions] = useState<CompanyQuestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyName) {
      setQuestions([]);
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
