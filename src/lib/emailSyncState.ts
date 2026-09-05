import { supabase } from "./supabase";

// email_sync_state is keyed by user_id (PK) and RLS-scoped to auth.uid(), so
// reads need no explicit filter. Writes still need user_id in the upsert
// payload to satisfy the RLS `with check`.

// The subject of the most recent email a sync has seen — a watermark, not a
// per-message dedup list. Gmail's search results are newest-first, so a sync
// stops walking the list as soon as it reaches this subject.
export async function getLastSeenSubject(): Promise<string | null> {
  const { data, error } = await supabase.from("email_sync_state").select("last_subject").maybeSingle();
  if (error) {
    console.error("Failed to load email sync watermark:", error);
    return null;
  }
  return data?.last_subject ?? null;
}

export async function saveLastSeenSubject(subject: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("email_sync_state")
    .upsert(
      { user_id: userId, last_subject: subject, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) console.error("Failed to save email sync watermark:", error);
}
