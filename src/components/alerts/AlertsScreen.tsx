import { useEffect, useState, type FormEvent } from "react";
import { useAlertPreferences } from "../../hooks/useAlertPreferences";
import { useLcCompanies } from "../../hooks/useLcCompanies";
import { useUserCompanies } from "../../hooks/useUserCompanies";
import {
  ALERT_CATEGORIES,
  DEFAULT_ALERT_PREFERENCES,
  canEnableEmail,
  getCompanySuggestions,
  type AlertCategory,
  type AlertCompany,
  type AlertPreferences,
  type CompanySuggestion,
} from "../../lib/alerts";
import { LOCATION_SUGGESTIONS } from "../../lib/alertLocations";
import { ThemeToggle } from "../layout/ThemeToggle";
import { Logo } from "../shared/Logo";
import { ChipInput } from "./ChipInput";
import { CompanyChooser } from "./CompanyChooser";
import "../../styles/alerts.css";

interface AlertsScreenProps {
  userId: string;
  userEmail: string | undefined;
  // intake = the one-time prompt before the tour (Skip / Save, both call onDone);
  // edit = opened from the account menu (Back / Save).
  mode: "intake" | "edit";
  onDone: () => void;
}

type Kind = "jobs" | "internships" | "both";

const LOCATION_QUICK_PICKS = ["Remote", "SF Bay Area", "New York City", "Seattle area", "San Jose, CA", "Austin, TX", "Boston area"];
const RECOMMENDED_COMPANIES = 12;

const KIND_OPTIONS: { id: Kind; label: string }[] = [
  { id: "internships", label: "Internships" },
  { id: "jobs", label: "New-grad jobs" },
  { id: "both", label: "Both" },
];

function kindOf(p: AlertPreferences): Kind | null {
  if (p.wantsJobs && p.wantsInternships) return "both";
  if (p.wantsJobs) return "jobs";
  if (p.wantsInternships) return "internships";
  return null;
}

// Job-alert preferences: what to match (kind, roles, keywords, companies,
// location, visa) and how to send it (email on/off, instant or daily).
export function AlertsScreen({ userId, userEmail, mode, onDone }: AlertsScreenProps) {
  const alerts = useAlertPreferences(userId);
  const { companies: companyNames } = useLcCompanies();
  const { pinned } = useUserCompanies();

  // The form edits a draft, seeded once the saved settings load.
  const [draft, setDraft] = useState<AlertPreferences | null>(null);
  const [draftCompanies, setDraftCompanies] = useState<AlertCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<CompanySuggestion[]>([]);

  // Recommendations follow the picked kind + roles; the previous list stays
  // up while the next one loads.
  const loaded = draft !== null;
  const wantsJobs = draft?.wantsJobs ?? false;
  const wantsInternships = draft?.wantsInternships ?? false;
  const categoriesKey = draft?.categories.join("|") ?? "";
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const categories = categoriesKey ? (categoriesKey.split("|") as AlertCategory[]) : [];
    getCompanySuggestions({ wantsJobs, wantsInternships, categories }, RECOMMENDED_COMPANIES).then((list) => {
      if (!cancelled) setRecommended(list);
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, wantsJobs, wantsInternships, categoriesKey]);

  useEffect(() => {
    if (alerts.loading || alerts.loadError || draft) return;
    setDraft(alerts.preferences ?? DEFAULT_ALERT_PREFERENCES);
    setDraftCompanies(alerts.companies);
  }, [alerts.loading, alerts.loadError, alerts.preferences, alerts.companies, draft]);

  function update(patch: Partial<AlertPreferences>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setError(null);
  }

  function toggleCategory(category: AlertCategory) {
    if (!draft) return;
    const has = draft.categories.includes(category);
    update({
      categories: has
        ? draft.categories.filter((c) => c !== category)
        : ALERT_CATEGORIES.filter((c) => c === category || draft.categories.includes(c)),
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || alerts.saving) return;
    if (draft.emailEnabled && !canEnableEmail(draft)) {
      setError("Pick what you're looking for and at least one role, or turn email alerts off.");
      return;
    }
    const saveError = await alerts.save(draft, draftCompanies);
    if (saveError) setError(saveError);
    else onDone();
  }

  const kind = draft ? kindOf(draft) : null;

  return (
    <div className="landing alerts-screen">
      <header className="landing__nav">
        <Logo />
        <div className="landing__nav-actions">
          <ThemeToggle />
        </div>
      </header>

      <main className="alerts-screen__body">
        <div className="alerts-screen__card">
          <div className="alerts-screen__head">
            <h1 className="alerts-screen__title">
              {mode === "intake" ? "Get new roles in your inbox" : "Job alerts"}
            </h1>
            <button type="button" className="alerts-screen__skip" onClick={onDone}>
              {mode === "intake" ? "Skip for now" : "Cancel"}
            </button>
          </div>
          <p className="alerts-screen__lede">
            Pick the companies and places you care about and we'll email you every new posting there, in any role.
            Your roles and keywords decide what shows up first. You can change this anytime from the account menu.
          </p>

          {alerts.loadError ? (
            <div className="alerts-screen__status" role="alert">
              <p>Couldn't load your alert settings.</p>
              <button type="button" className="landing-btn landing-btn--ghost" onClick={alerts.reload}>
                Try again
              </button>
            </div>
          ) : !draft ? (
            <p className="alerts-screen__status" role="status">
              Loading…
            </p>
          ) : (
            <form className="alerts-form" onSubmit={handleSubmit} noValidate>
              <fieldset className="alerts-field">
                <legend className="alerts-field__label">Looking for</legend>
                <div className="alerts-segments" role="radiogroup">
                  {KIND_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={`alerts-segment${kind === option.id ? " alerts-segment--active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="alerts-kind"
                        checked={kind === option.id}
                        onChange={() =>
                          update({
                            wantsJobs: option.id !== "internships",
                            wantsInternships: option.id !== "jobs",
                          })
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="alerts-field">
                <legend className="alerts-field__label">Roles</legend>
                <p className="alerts-field__hint">
                  These come first in your emails. With no companies or locations below, you'll get every posting in
                  these roles.
                </p>
                <div className="alerts-toggles">
                  {ALERT_CATEGORIES.map((category) => {
                    const on = draft.categories.includes(category);
                    return (
                      <button
                        key={category}
                        type="button"
                        className={`alerts-toggle${on ? " alerts-toggle--on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleCategory(category)}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <CompanyChooser
                names={companyNames}
                pins={pinned}
                recommended={recommended}
                value={draftCompanies}
                onChange={(next) => {
                  setDraftCompanies(next);
                  setError(null);
                }}
                anyFaang={draft.anyFaang}
                onAnyFaangChange={(anyFaang) => update({ anyFaang })}
              />

              <ChipInput
                label="Locations"
                hint="Every new posting in these places, in any role."
                placeholder="City, metro or state…"
                values={draft.locations}
                onChange={(locations) => update({ locations })}
                suggestions={LOCATION_SUGGESTIONS}
                quickPicks={{ title: "Popular", items: LOCATION_QUICK_PICKS }}
              />

              <ChipInput
                label="Title keywords"
                hint="Postings whose title matches go to the top of your emails, e.g. power, frontend, ML infra."
                placeholder="Type and press Enter"
                values={draft.titleKeywords}
                onChange={(titleKeywords) => update({ titleKeywords })}
              />

              <label className="alerts-check">
                <input
                  type="checkbox"
                  checked={draft.needsSponsorship}
                  onChange={(e) => update({ needsSponsorship: e.target.checked })}
                />
                <span>
                  I need visa sponsorship
                  <small>Hides postings marked no-sponsorship or US-citizens-only. Not every source labels this.</small>
                </span>
              </label>

              <fieldset className="alerts-field alerts-field--delivery">
                <legend className="alerts-field__label">Delivery</legend>
                <label className="alerts-check">
                  <input
                    type="checkbox"
                    checked={draft.emailEnabled}
                    onChange={(e) => update({ emailEnabled: e.target.checked })}
                  />
                  <span>
                    Email me matches{userEmail ? ` at ${userEmail}` : ""}
                    <small>Unsubscribe from any alert email in one click.</small>
                  </span>
                </label>
                {draft.emailEnabled && (
                  <div className="alerts-segments" role="radiogroup" aria-label="How often">
                    {(
                      [
                        ["instant", "As they're posted", "Within about 30 minutes"],
                        ["daily", "Daily digest", "9am your time"],
                      ] as const
                    ).map(([id, label, detail]) => (
                      <label
                        key={id}
                        className={`alerts-segment alerts-segment--detail${
                          draft.frequency === id ? " alerts-segment--active" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="alerts-frequency"
                          checked={draft.frequency === id}
                          onChange={() => update({ frequency: id })}
                        />
                        {label}
                        <small>{detail}</small>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {error && (
                <p className="alerts-form__error" role="alert">
                  {error}
                </p>
              )}

              <div className="alerts-form__actions">
                <button type="submit" className="landing-btn landing-btn--primary" disabled={alerts.saving}>
                  {alerts.saving ? "Saving…" : mode === "intake" && draft.emailEnabled ? "Turn on alerts" : "Save"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
