import { supabase } from "./supabase";

export interface UserCompany {
  company_name: string;
  is_pinned: boolean;
  pinned_at: string | null;
  is_in_process: boolean;
}

export type UserCompanyFlags = Partial<Pick<UserCompany, "is_pinned" | "pinned_at" | "is_in_process">>;

// Per-user company flags (pin, in process). RLS scopes every query to the
// caller, and user_id defaults to auth.uid() server-side, so none of these
// take a user id.
export async function getUserCompanies(): Promise<UserCompany[]> {
  const { data, error } = await supabase
    .from("user_companies")
    .select("company_name, is_pinned, pinned_at, is_in_process");
  if (error) {
    console.error("Failed to load user companies:", error);
    return [];
  }
  return (data ?? []) as UserCompany[];
}

// Upsert on (user_id, company_name) — only the passed flags are written, so
// toggling one never clobbers the other.
export async function saveUserCompany(companyName: string, flags: UserCompanyFlags): Promise<void> {
  const { error } = await supabase
    .from("user_companies")
    .upsert(
      { company_name: companyName, ...flags, updated_at: new Date().toISOString() },
      { onConflict: "user_id,company_name" },
    );
  if (error) console.error("Failed to save user company:", error);
}
