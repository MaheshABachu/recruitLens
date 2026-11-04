import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Company logos come from Logo.dev's image CDN, keyed by the domains in
// company_domains (filled by scripts/import-company-domains.ts). Without
// VITE_LOGO_DEV_TOKEN, or for a company with no known domain, or when the
// image fails to load, CompanyMonogram keeps its two-letter badge.
//
// The name -> domain map is loaded once per page (a few thousand short rows)
// and shared by every monogram through a tiny external store.

const TOKEN = import.meta.env.VITE_LOGO_DEV_TOKEN;
const PAGE = 1000;

let domains: Map<string, string> | null = null;
let loading = false;
const listeners = new Set<() => void>();
// Domains whose image 404'd/failed this session, so remounts don't retry.
const failed = new Set<string>();

async function load() {
  loading = true;
  const map = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("company_domains")
      .select("name_key, domain")
      .not("domain", "is", null)
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("company_domains:", error.message);
      break;
    }
    for (const row of data) map.set(row.name_key, row.domain);
    if (data.length < PAGE) break;
  }
  domains = map;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!domains && !loading && TOKEN) void load();
  return () => listeners.delete(listener);
}

const getSnapshot = () => domains;

export function useCompanyDomain(name: string): string | null {
  const map = useSyncExternalStore(subscribe, getSnapshot);
  if (!TOKEN || !map) return null;
  const domain = map.get(name.trim().toLowerCase());
  return domain && !failed.has(domain) ? domain : null;
}

export function markLogoFailed(domain: string) {
  failed.add(domain);
}

// fallback=404 makes Logo.dev return an error (→ onError → monogram) instead
// of its own generated placeholder. Requested at 2x the largest badge size.
export function logoUrl(domain: string, theme: "light" | "dark") {
  const params = new URLSearchParams({ token: TOKEN ?? "", size: "80", format: "png", theme, fallback: "404" });
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params}`;
}

export const LOGOS_ENABLED = Boolean(TOKEN);
