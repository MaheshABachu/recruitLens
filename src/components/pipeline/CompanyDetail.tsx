import type { Company, Role } from "../../types/pipeline";
import { Card } from "../shared/Card";
import { StatusBadge } from "../shared/StatusBadge";
import { DetailHeader } from "./DetailHeader";
import { PipelineTracker } from "./PipelineTracker";
import { FieldGrid } from "./FieldGrid";
import { MaterialsSection } from "./MaterialsSection";
import { CompanyQuestions } from "./CompanyQuestions";
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
  const { questions } = useCompanyQuestions(company?.name);
  const solvedSlugs = useLeetCodeSolvedSlugs();

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

      <div className={`company-detail__row ${questions.length === 0 ? "company-detail__row--single" : ""}`}>
        <Card title="Details" className="company-detail__section">
          <FieldGrid
            role={activeRole}
            onChange={(field, value) => onUpdateRoleField(company.id, activeRoleIndex, field, value)}
          />
        </Card>

        {questions.length > 0 && (
          <Card title="Company questions" className="company-detail__section">
            <CompanyQuestions questions={questions} solvedSlugs={solvedSlugs} />
          </Card>
        )}
      </div>

      <Card title="Application materials" className="company-detail__section">
        <MaterialsSection role={activeRole} />
      </Card>
    </main>
  );
}
