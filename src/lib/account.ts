import { supabase } from "./supabase";

// Permanently deletes the signed-in account via the delete-account Edge
// Function (cancels any Stripe subscription immediately, then deletes the
// auth user; user-owned rows cascade). Signs out locally afterwards — the
// server-side session no longer exists.
export async function deleteAccount() {
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? "Couldn't delete your account. Try again.");
  }
  try {
    localStorage.removeItem("vantage-theme");
    for (const key of Object.keys(localStorage)) if (key.startsWith("vantage-onboarded:")) localStorage.removeItem(key);
  } catch {
    // Storage blocked — nothing to clean up.
  }
  await supabase.auth.signOut({ scope: "local" });
}
