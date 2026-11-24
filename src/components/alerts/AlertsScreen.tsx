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
import { ALERT_FREQUENCIES, FREQUENCY_DETAIL, FREQUENCY_LABEL } from "../../lib/alertFrequency";
import { LOCATION_SUGGESTIONS } from "../../lib/alertLocations";
import { DEFENSE_COMPANY_NAMES } from "../../lib/defenseCompanies";
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
const DEFENSE_PREVIEW = 6;

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
// location, visa, blocked companies) and how to send it (email on/off, how often).
export function AlertsScreen({ userId, userEmail, mode, onDone }: AlertsScreenProps) {
  const alerts = useAlertPreferences(userId);
  const { companies: companyNames } = useLcCompanies();
  const { pinned } = useUserCompanies();

  // The form edits a draft, seeded once the saved settings load.
  const [draft, setDraft] = useState<AlertPreferences | null>(null);
  const [draftCompanies, setDraftCompanies] = useState<AlertCompany[]>([]);
  const [draftExcluded, setDraftExcluded] = useState<AlertCompany[]>([]);
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
    setDraftExcluded(alerts.excluded);
  }, [alerts.loading, alerts.loadError, alerts.preferences, alerts.companies, alerts.excluded, draft]);

  // A company lives in one list: adding it to one takes it off the other.
  function changeCompanies(next: AlertCompany[]) {
    const keys = new Set(next.map((c) => c.nameKey));
    setDraftCompanies(next);
    setDraftExcluded((prev) => prev.filter((c) => !keys.has(c.nameKey)));
    setError(null);
  }

  function changeExcluded(next: AlertCompany[]) {
    const keys = new Set(next.map((c) => c.nameKey));
    setDraftExcluded(next);
    setDraftCompanies((prev) => prev.filter((c) => !keys.has(c.nameKey)));
    setError(null);
  }

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
    const saveError = await alerts.save(draft, draftCompanies, draftExcluded);
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
                label="Ideal companies"
                hint="Every new posting at these companies, in any role."
                names={[...companyNames, ...recommended.map((r) => r.displayName)]}
                value={draftCompanies}
                onChange={changeCompanies}
                toggle={{
                  label: "Any FAANG+ company",
                  className: "alerts-toggle--faang",
                  on: draft.anyFaang,
                  onChange: (anyFaang) => update({ anyFaang }),
                }}
                quickPicks={[
                  { title: "Your pins", items: pinned.map((label) => ({ label })) },
                  {
                    title: "Hiring most for your picks",
                    items: recommended.map((r) => ({ label: r.displayName, detail: String(r.postings) })),
                  },
                ]}
              />

              <CompanyChooser
                label="Never email me about"
                hint="Blocked companies never show up in your alerts, even when they match everything else."
                placeholder="Block a company…"
                tone="blocked"
                names={companyNames}
                value={draftExcluded}
                onChange={changeExcluded}
                toggle={{
                  label: "Block defense tech",
                  className: "alerts-toggle--block",
                  on: draft.excludeDefense,
                  onChange: (excludeDefense) => update({ excludeDefense }),
                  note: (
                    <p className="alerts-field__note" title={DEFENSE_COMPANY_NAMES.join(", ")}>
                      Covers {DEFENSE_COMPANY_NAMES.slice(0, DEFENSE_PREVIEW).join(", ")} and{" "}
                      {DEFENSE_COMPANY_NAMES.length - DEFENSE_PREVIEW} more defense contractors, plus any company
                      with “Defense” in its name.
                    </p>
                  ),
                }}
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
                  <>
                    <p className="alerts-field__hint">How often</p>
                    <div className="alerts-segments alerts-segments--frequency" role="radiogroup" aria-label="How often">
                      {ALERT_FREQUENCIES.map((id) => (
                        <label
                          key={id}
                          className={`alerts-segment${draft.frequency === id ? " alerts-segment--active" : ""}`}
                        >
                          <input
                            type="radio"
                            name="alerts-frequency"
                            checked={draft.frequency === id}
                            onChange={() => update({ frequency: id })}
                          />
                          {FREQUENCY_LABEL[id]}
                        </label>
                      ))}
                    </div>
                    <p className="alerts-field__note">{FREQUENCY_DETAIL[draft.frequency]}</p>
                  </>
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
