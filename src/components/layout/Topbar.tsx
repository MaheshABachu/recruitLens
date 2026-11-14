import { AccountMenu } from "./AccountMenu";
import { Logo } from "../shared/Logo";
import type { Subscription } from "../../lib/billing";

interface TopbarProps {
  userEmail?: string | null;
  onSignOut: () => void;
  // undefined when billing is disabled.
  subscription?: Subscription | null;
  trialEnd?: Date | null;
  onChoosePlan?: () => void;
  onStartTour?: () => void;
  onOpenAlerts?: () => void;
  alertsStatus?: string | null;
}

export function Topbar({
  userEmail,
  onSignOut,
  subscription,
  trialEnd,
  onChoosePlan,
  onStartTour,
  onOpenAlerts,
  alertsStatus,
}: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <Logo size={20} />
      </div>
      <div className="topbar__right">
        <AccountMenu
          userEmail={userEmail}
          onSignOut={onSignOut}
          subscription={subscription}
          trialEnd={trialEnd}
          onChoosePlan={onChoosePlan}
          onStartTour={onStartTour}
          onOpenAlerts={onOpenAlerts}
          alertsStatus={alertsStatus}
        />
      </div>
    </header>
  );
}
