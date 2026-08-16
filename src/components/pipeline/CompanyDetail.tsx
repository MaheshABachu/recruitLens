import type { Company, Role } from "../../types/pipeline";
import { Card } from "../shared/Card";
import { StatusBadge } from "../shared/StatusBadge";
import { DetailHeader } from "./DetailHeader";
import { PipelineTracker } from "./PipelineTracker";
import { FieldGrid } from "./FieldGrid";
import { MaterialsSection } from "./MaterialsSection";

interface CompanyDetailProps {
  company: Company | null;
  activeRole: Role | null;
  activeRoleIndex: number;
  onSelectRole: (index: number) => void;
  onTogglePriority: (companyId: string) => void;
}

export function CompanyDetail({
  company,
  activeRole,
  activeRoleIndex,
  onSelectRole,
  onTogglePriority,
}: CompanyDetailProps) {
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
      />

      <div className="company-detail__status-row">
        <StatusBadge status={activeRole.status} />
      </div>

      <PipelineTracker status={activeRole.status} />

      <Card title="Details" className="company-detail__section">
        <FieldGrid role={activeRole} />
      </Card>

      <Card title="Application materials" className="company-detail__section">
        <MaterialsSection role={activeRole} />
      </Card>
    </main>
  );
}
