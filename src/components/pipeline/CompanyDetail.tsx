import { useEffect, useState } from "react";
import type { Company, PipelineStatus, Role } from "../../types/pipeline";
import { Card } from "../shared/Card";
import { StatusBadge } from "../shared/StatusBadge";
import { DetailHeader } from "./DetailHeader";
import { PipelineTracker } from "./PipelineTracker";
import { FieldGrid } from "./FieldGrid";
import { MaterialsSection } from "./MaterialsSection";
import { CompanyQuestions } from "./CompanyQuestions";
import { TopicProfile } from "./TopicProfile";
import { MediaTracking } from "./MediaTracking";
import { AddRoleModal } from "./AddRoleModal";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { useCompanyQuestions } from "../../hooks/useCompanyQuestions";
import { useLeetCodeSolvedSlugs } from "../../hooks/useLeetCodeSolvedSlugs";

type DetailTab = "details" | "leetcode" | "topic" | "media";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "leetcode", label: "LeetCode" },
  { id: "topic", label: "Topic Chart" },
  { id: "media", label: "Media Tracking" },
];

interface CompanyDetailProps {
  company: Company | null;
  activeRole: Role | null;
  activeRoleIndex: number;
  onSelectRole: (index: number) => void;
  onTogglePriority: (companyId: string) => void;
  onUpdateRoleField: <K extends keyof Role>(companyId: string, roleIndex: number, field: K, value: Role[K]) => void;
  onAddRole: (companyId: string, input: { role: string; status: PipelineStatus }) => void;
  onDeleteCompany: (companyId: string) => void;
}

export function CompanyDetail({
  company,
  activeRole,
  activeRoleIndex,
  onSelectRole,
  onTogglePriority,
  onUpdateRoleField,
  onAddRole,
  onDeleteCompany,
}: CompanyDetailProps) {
  const { questions, loading: questionsLoading } = useCompanyQuestions(company?.name);
  const solvedSlugs = useLeetCodeSolvedSlugs();
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("details");

  useEffect(() => {
    setIsAddRoleOpen(false);
    setActiveDetailTab("details");
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
        onAddRole={() => setIsAddRoleOpen(true)}
        onDelete={() => onDeleteCompany(company.id)}
      />

      {isAddRoleOpen && (
        <AddRoleModal
          companyName={company.name}
          onClose={() => setIsAddRoleOpen(false)}
          onSubmit={(input) => onAddRole(company.id, input)}
        />
      )}

      <div className="company-detail__status-row">
        <StatusBadge status={activeRole.status} />
      </div>

      <PipelineTracker status={activeRole.status} />

      <nav className="tab-bar company-detail__tabs" aria-label="Company detail sections">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-bar__tab ${activeDetailTab === tab.id ? "tab-bar__tab--active" : ""}`}
            onClick={() => setActiveDetailTab(tab.id)}
            aria-current={activeDetailTab === tab.id ? "true" : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="company-detail__tab-panel">
        {activeDetailTab === "details" && (
          <Card title="Details" className="company-detail__section">
            <FieldGrid
              role={activeRole}
              onChange={(field, value) => onUpdateRoleField(company.id, activeRoleIndex, field, value)}
            />
          </Card>
        )}

        {activeDetailTab === "leetcode" && (
          <Card title="LeetCode" className="company-detail__section">
            {questionsLoading ? (
              <LoadingSpinner />
            ) : questions.length === 0 ? (
              <p className="company-detail__tab-empty">No LeetCode question data for this company yet.</p>
            ) : (
              <CompanyQuestions questions={questions} solvedSlugs={solvedSlugs} />
            )}
          </Card>
        )}

        {activeDetailTab === "topic" && (
          <Card
            title={questionsLoading || questions.length === 0 ? "Topic Chart" : undefined}
            className="company-detail__section"
          >
            {questionsLoading ? (
              <LoadingSpinner />
            ) : questions.length === 0 ? (
              <p className="company-detail__tab-empty">No topic data for this company yet.</p>
            ) : (
              <TopicProfile companyName={company.name} questions={questions} />
            )}
          </Card>
        )}

        {activeDetailTab === "media" && (
          <Card className="company-detail__section">
            <MediaTracking companyName={company.name} />
          </Card>
        )}
      </div>

      <Card title="Application materials" className="company-detail__section">
        <MaterialsSection role={activeRole} />
      </Card>
    </main>
  );
}
