import { supabase } from "./supabase";

// profiles is RLS-scoped to auth.uid(); clients may only update onboarded_at
// (supabase/migrations/20261104120000_profiles_onboarded_at.sql).

// true = the user has finished or skipped the tour, false = not yet,
// null = couldn't tell (error or no profile row) — callers treat that as "don't show".
export async function getHasOnboarded(): Promise<boolean | null> {
  const { data, error } = await supabase.from("profiles").select("onboarded_at").maybeSingle();
  if (error) {
    console.error("Failed to load onboarding state:", error);
    return null;
  }
  if (!data) return null;
  return data.onboarded_at !== null;
}

export async function markOnboarded(userId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) console.error("Failed to save onboarding state:", error);
}
