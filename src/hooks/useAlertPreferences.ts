import { useCallback, useEffect, useState } from "react";
import {
  getAlertSettings,
  normalizePreferences,
  saveAlertSettings,
  type AlertCompany,
  type AlertPreferences,
  type AlertSettings,
} from "../lib/alerts";

type LoadState = "loading" | "ready" | "error";

// Loads the caller's alert preferences + ideal companies and saves them as one
// form (not optimistic: save resolves to an error message or null so the
// intake / Alerts screen can show it). Pass null while signed out.
export function useAlertPreferences(userId: string | null) {
  const [state, setState] = useState<LoadState>("loading");
  const [settings, setSettings] = useState<AlertSettings>({ preferences: null, companies: [] });
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setState("loading");
    getAlertSettings().then((loaded) => {
      if (cancelled) return;
      if (loaded) {
        setSettings(loaded);
        setState("ready");
      } else {
        setState("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const save = useCallback(
    async (preferences: AlertPreferences, companies: AlertCompany[]): Promise<string | null> => {
      setSaving(true);
      const error = await saveAlertSettings(preferences, companies, settings.companies);
      setSaving(false);
      // Reload either way: a partial failure may have written some of it.
      if (error) reload();
      else setSettings({ preferences: normalizePreferences(preferences), companies });
      return error;
    },
    [settings.companies, reload],
  );

  return {
    loading: state === "loading",
    loadError: state === "error",
    preferences: settings.preferences,
    companies: settings.companies,
    saving,
    save,
    reload,
  };
}
