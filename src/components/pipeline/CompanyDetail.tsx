import { useEffect, useState } from "react";
import type { Company, Role } from "../../types/pipeline";
import { Card } from "../shared/Card";
import { StatusBadge } from "../shared/StatusBadge";
import { DetailHeader } from "./DetailHeader";
import { PipelineTracker } from "./PipelineTracker";
import { FieldGrid } from "./FieldGrid";
import { MaterialsSection } from "./MaterialsSection";
import { CompanyQuestions } from "./CompanyQuestions";
import { TopicProfile } from "./TopicProfile";
import { MediaTracking } from "./MediaTracking";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { useCompanyQuestions } from "../../hooks/useCompanyQuestions";
import { useLeetCodeSolvedSlugs } from "../../hooks/useLeetCodeSolvedSlugs";

interface CompanyDetailProps {
  company: Company | null;
  activeRole: Role | null;
  activeRoleIndex: number;
  onSelectRole: (index: number) => void;
  onTogglePriority: (companyId: string) => void;
  onUpdateRoleField: <K extends keyof Role>(companyId: string, roleIndex: number, field: K, value: Role[K]) => void;
  onDeleteCompany: (companyId: string) => void;
}

export function CompanyDetail({
  company,
  activeRole,
  activeRoleIndex,
  onSelectRole,
  onTogglePriority,
  onUpdateRoleField,
  onDeleteCompany,
}: CompanyDetailProps) {
  const { questions, loading: questionsLoading } = useCompanyQuestions(company?.name);
  const solvedSlugs = useLeetCodeSolvedSlugs();
  const [topicExpanded, setTopicExpanded] = useState(false);
  const [mediaRowExpanded, setMediaRowExpanded] = useState<"questions" | "media" | null>(null);

  useEffect(() => {
    setTopicExpanded(false);
    setMediaRowExpanded(null);
  }, [company?.id]);

  if (!company || !activeRole) {
    return (
      <main className="company-detail company-detail--empty">
        <p>Select a company to see its pipeline.</p>
      </main>
    );
  }

  return (
    <main className="company-detail">
      <DetailHeader
        company={company}
        activeRoleIndex={activeRoleIndex}
        onSelectRole={onSelectRole}
        onTogglePriority={() => onTogglePriority(company.id)}
        onDelete={() => onDeleteCompany(company.id)}
      />

      <div className="company-detail__status-row">
        <StatusBadge status={activeRole.status} />
      </div>

      <PipelineTracker status={activeRole.status} />

      <div
        className={`company-detail__row ${
          !questionsLoading && questions.length === 0 ? "company-detail__row--single" : ""
        }`}
      >
        <div
          className={`company-detail__details-slot ${topicExpanded ? "company-detail__details-slot--collapsed" : ""}`}
        >
          {topicExpanded ? (
            <button
              type="button"
              className="details-strip"
              onClick={() => setTopicExpanded(false)}
              aria-label="Show details"
              aria-expanded={false}
            >
              <span className="details-strip__label">Details</span>
            </button>
          ) : (
            <Card title="Details" className="company-detail__section">
              <FieldGrid
                role={activeRole}
                onChange={(field, value) => onUpdateRoleField(company.id, activeRoleIndex, field, value)}
              />
            </Card>
          )}
        </div>

        {(questionsLoading || questions.length > 0) && (
          <Card title={questionsLoading ? "Topic profile" : undefined} className="company-detail__section company-detail__topic-slot">
            {questionsLoading ? (
              <LoadingSpinner />
            ) : (
              <TopicProfile
                companyName={company.name}
                questions={questions}
                expanded={topicExpanded}
                onToggleExpanded={() => setTopicExpanded((v) => !v)}
              />
            )}
          </Card>
        )}
      </div>

      <div
        className={`company-detail__row ${
          !questionsLoading && questions.length === 0 ? "company-detail__row--single" : ""
        }`}
      >
        {(questionsLoading || questions.length > 0) && (
          <Card
            title={questionsLoading ? "Company questions" : undefined}
            className={`company-detail__section company-detail__split-card ${
              mediaRowExpanded === "media" ? "company-detail__split-card--collapsed" : ""
            }`}
          >
            {questionsLoading ? (
              <LoadingSpinner />
            ) : mediaRowExpanded === "media" ? (
              <button
                type="button"
                className="collapse-strip"
                onClick={() => setMediaRowExpanded(null)}
                aria-label="Show company questions"
                aria-expanded={false}
              >
                <span className="collapse-strip__label">Company questions</span>
              </button>
            ) : (
              <CompanyQuestions
                questions={questions}
                solvedSlugs={solvedSlugs}
                expanded={mediaRowExpanded === "questions"}
                onToggleExpanded={() => setMediaRowExpanded((v) => (v === "questions" ? null : "questions"))}
              />
            )}
          </Card>
        )}

        <Card
          className={`company-detail__section company-detail__split-card ${
            mediaRowExpanded === "questions" ? "company-detail__split-card--collapsed" : ""
          }`}
        >
          {mediaRowExpanded === "questions" ? (
            <button
              type="button"
              className="collapse-strip"
              onClick={() => setMediaRowExpanded(null)}
              aria-label="Show media tracking"
              aria-expanded={false}
            >
              <span className="collapse-strip__label">Media tracking</span>
            </button>
          ) : (
            <MediaTracking
              companyName={company.name}
              expanded={mediaRowExpanded === "media"}
              onToggleExpanded={() => setMediaRowExpanded((v) => (v === "media" ? null : "media"))}
            />
          )}
        </Card>
      </div>

      <Card title="Application materials" className="company-detail__section">
        <MaterialsSection role={activeRole} />
      </Card>
    </main>
  );
}
