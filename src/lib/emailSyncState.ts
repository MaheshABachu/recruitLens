import { supabase } from "./supabase";

const ROW_ID = 1;

// The subject of the most recent email a sync has seen — a watermark, not a
// per-message dedup list. Gmail's search results are newest-first, so a sync
// stops walking the list as soon as it reaches this subject.
export async function getLastSeenSubject(): Promise<string | null> {
  const { data, error } = await supabase
    .from("email_sync_state")
    .select("last_subject")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) {
    console.error("Failed to load email sync watermark:", error);
    return null;
  }
  return data?.last_subject ?? null;
}

export async function saveLastSeenSubject(subject: string): Promise<void> {
  const { error } = await supabase
    .from("email_sync_state")
    .upsert({ id: ROW_ID, last_subject: subject, updated_at: new Date().toISOString() });
  if (error) console.error("Failed to save email sync watermark:", error);
}
