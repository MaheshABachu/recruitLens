import type { CSSProperties } from "react";
import { CompanyMonogram } from "../companies/CompanyMonogram";
import { companyHueVar } from "../../lib/companyColors";
import type { JobPosting } from "../../types/jobPosting";

// Postings this many days old or newer get the green "New" badge.
const NEW_WITHIN_DAYS = 2;

// Whole days since a "YYYY-MM-DD" date_posted, in the viewer's timezone.
export function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const posted = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - posted.getTime()) / 86_400_000));
}

function ageLabel(days: number, isoDate: string) {
  if (days <= 30) return `${days}d`;
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface JobRowProps {
  posting: JobPosting;
  // Canonical lc_companies name when this company is in the question bank.
  prepCompany: string | null;
  // Distinct questions for prepCompany; undefined while stats load.
  prepCount: number | undefined;
  onPrep: (company: string) => void;
}

export function JobRow({ posting, prepCompany, prepCount, onPrep }: JobRowProps) {
  const days = daysSince(posting.datePosted);
  const isNew = days !== null && days <= NEW_WITHIN_DAYS;

  return (
    <li className="jobs-board__row" data-tour="job-row" style={{ "--row-hue": companyHueVar(posting.company) } as CSSProperties}>
      <CompanyMonogram name={posting.company} />

      <div className="jobs-board__row-main">
        <div className="jobs-board__row-top">
          <a href={posting.url} target="_blank" rel="noopener noreferrer" className="jobs-board__job-title">
            {posting.title}
          </a>
          {isNew ? (
            <span className="jobs-board__new">New</span>
          ) : (
            days !== null && posting.datePosted && (
              <span className="jobs-board__age" title={`Posted ${posting.datePosted}`}>
                {ageLabel(days, posting.datePosted)}
              </span>
            )
          )}
        </div>

        <div className="jobs-board__meta">
          {posting.companyUrl ? (
            <a href={posting.companyUrl} target="_blank" rel="noopener noreferrer" className="jobs-board__company">
              {posting.company}
            </a>
          ) : (
            <span className="jobs-board__company">{posting.company}</span>
          )}
          {posting.location && <span className="jobs-board__location">{posting.location}</span>}
          {posting.workModel && <span className="jobs-board__chip">{posting.workModel}</span>}
        </div>

        <div className="jobs-board__tags">
          {posting.isFaang && <span className="jobs-board__tag jobs-board__tag--faang">FAANG+</span>}
          {posting.salary && <span className="jobs-board__tag jobs-board__tag--salary">{posting.salary}</span>}
          {posting.noSponsorship && <span className="jobs-board__tag jobs-board__tag--blocker">No sponsorship</span>}
          {posting.requiresUsCitizenship && (
            <span className="jobs-board__tag jobs-board__tag--blocker">US citizenship</span>
          )}
          {posting.advancedDegreeRequired && (
            <span className="jobs-board__tag jobs-board__tag--caution">Advanced degree</span>
          )}
          {prepCompany && (
            <button
              type="button"
              className="jobs-board__prep"
              data-tour="prep"
              onClick={() => onPrep(prepCompany)}
              title={`Open ${prepCompany} in Company Questions`}
            >
              <CompanyMonogram name={prepCompany} size="sm" />
              Prep
              {prepCount !== undefined && <b>{prepCount.toLocaleString()} Qs</b>}
            </button>
          )}
          {posting.sources.length > 1 && (
            <span className="jobs-board__sources" title={`Listed on ${posting.sources.join(", ")}`}>
              On {posting.sources.length} lists
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
