import type { PipelineStatus } from "../../types/pipeline";
import { FORWARD_STAGES, stageState } from "../../lib/pipelineUtils";

interface PipelineTrackerProps {
  status: PipelineStatus;
}

/**
 * Pure presentational — takes a status, renders the 5-stage tracker. The
 * nodes double as Vantage's signature visual: the "current" node gets a
 * focus-ring pulse.
 */
export function PipelineTracker({ status }: PipelineTrackerProps) {
  const isRejected = status === "Rejected";
  const isNotStarted = status === "Not Applied";

  return (
    <div className="tracker">
      <div className={`tracker__track ${isRejected ? "tracker__track--rejected" : ""}`}>
        {FORWARD_STAGES.map((stage) => {
          const state = stageState(status, stage);
          return (
            <div key={stage} className={`tracker__stage tracker__stage--${state}`}>
              <span className="tracker__node" aria-hidden="true" />
              <span className="tracker__label">{stage}</span>
            </div>
          );
        })}
      </div>
      {isRejected && <p className="tracker__caption tracker__caption--rejected">✕ Rejected</p>}
      {isNotStarted && <p className="tracker__caption">Not started yet</p>}
    </div>
  );
}
