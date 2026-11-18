import { createClient, type SupportedStorage } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY were not set when the extension was built.");
}

// Session lives in chrome.storage.local so it survives service-worker restarts.
// Only the background worker uses this client; pages talk to it by message.
const storage: SupportedStorage = {
  async getItem(key) {
    const got = await chrome.storage.local.get(key);
    return (got[key] as string | undefined) ?? null;
  },
  async setItem(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key) {
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
