// Fills company_domains (company name -> website domain), which the frontend
// turns into logos via Logo.dev (src/lib/companyLogos.ts). Run via
// `npm run import:company-domains`; also runs after each job sync in
// .github/workflows/sync-jobs.yml so new posting companies get picked up.
//
// Two sources:
//   1. MANUAL below — hand-checked domains for the featured list and the most
//      frequent companies. Always upserted, and never overwritten by lookups.
//   2. Logo.dev's brand search (only if LOGO_DEV_SECRET_KEY is set) for every
//      other name in lc_companies / job_postings / internship_postings that
//      has no row yet. Only an exact (normalized) name match is accepted —
//      a wrong logo is worse than the monogram fallback. Misses are stored
//      with domain = null so they aren't re-queried every run; pass
//      --retry-misses to look them up again.
//
// Needs VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service role, bypasses
// RLS to write), same as the other import scripts.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const MAX_LOOKUPS_PER_RUN = 400;
const CONCURRENCY = 4;
const PAGE = 1000;

// Keys are lower-cased company names exactly as they appear in the data.
const MANUAL: Record<string, string> = {
  // Featured grid
  meta: "meta.com",
  apple: "apple.com",
  amazon: "amazon.com",
  netflix: "netflix.com",
  google: "google.com",
  microsoft: "microsoft.com",
  nvidia: "nvidia.com",
  databricks: "databricks.com",
  openai: "openai.com",
  uber: "uber.com",
  airbnb: "airbnb.com",
  stripe: "stripe.com",
  linkedin: "linkedin.com",
  bloomberg: "bloomberg.com",
  tiktok: "tiktok.com",
  salesforce: "salesforce.com",
  // Frequent in the question bank / postings
  accenture: "accenture.com",
  adobe: "adobe.com",
  agoda: "agoda.com",
  "akuna capital": "akunacapital.com",
  amd: "amd.com",
  "american express": "americanexpress.com",
  anduril: "anduril.com",
  "arista networks": "arista.com",
  atlassian: "atlassian.com",
  autodesk: "autodesk.com",
  barclays: "barclays.com",
  blackrock: "blackrock.com",
  "bny mellon": "bny.com",
  bny: "bny.com",
  "booking.com": "booking.com",
  bytedance: "bytedance.com",
  capgemini: "capgemini.com",
  "capital one": "capitalone.com",
  cisco: "cisco.com",
  citadel: "citadel.com",
  "citadel securities": "citadelsecurities.com",
  cognizant: "cognizant.com",
  coupang: "coupang.com",
  "de shaw": "deshaw.com",
  deloitte: "deloitte.com",
  "deutsche bank": "db.com",
  docusign: "docusign.com",
  doordash: "doordash.com",
  dropbox: "dropbox.com",
  ebay: "ebay.com",
  "epam systems": "epam.com",
  "epic systems": "epic.com",
  expedia: "expedia.com",
  flipkart: "flipkart.com",
  geico: "geico.com",
  "goldman sachs": "goldmansachs.com",
  grammarly: "grammarly.com",
  "hudson river trading": "hudsonrivertrading.com",
  ibm: "ibm.com",
  infosys: "infosys.com",
  intel: "intel.com",
  intuit: "intuit.com",
  "jane street": "janestreet.com",
  "jp morgan chase": "jpmorganchase.com",
  lyft: "lyft.com",
  mathworks: "mathworks.com",
  mongodb: "mongodb.com",
  "morgan stanley": "morganstanley.com",
  nutanix: "nutanix.com",
  okta: "okta.com",
  oracle: "oracle.com",
  "palo alto networks": "paloaltonetworks.com",
  palantir: "palantir.com",
  paypal: "paypal.com",
  pinterest: "pinterest.com",
  qualcomm: "qualcomm.com",
  rippling: "rippling.com",
  roblox: "roblox.com",
  roku: "roku.com",
  rubrik: "rubrik.com",
  samsung: "samsung.com",
  sap: "sap.com",
  servicenow: "servicenow.com",
  siemens: "siemens.com",
  snap: "snap.com",
  snowflake: "snowflake.com",
  sofi: "sofi.com",
  spacex: "spacex.com",
  tesla: "tesla.com",
  "two sigma": "twosigma.com",
  verkada: "verkada.com",
  visa: "visa.com",
  "walmart labs": "walmart.com",
  wayfair: "wayfair.com",
  waymo: "waymo.com",
  "wells fargo": "wellsfargo.com",
  x: "x.com",
  yahoo: "yahoo.com",
  yelp: "yelp.com",
  zscaler: "zscaler.com",
  "hewlett packard enterprise": "hpe.com",
  "micron technology": "micron.com",
  marvell: "marvell.com",
  "l3harris technologies": "l3harris.com",
  "texas instruments": "ti.com",
  "applied materials": "appliedmaterials.com",
  "northrop grumman": "northropgrumman.com",
  "lockheed martin": "lockheedmartin.com",
  boeing: "boeing.com",
  "general motors": "gm.com",
  rivian: "rivian.com",
  "electronic arts": "ea.com",
  "cadence design systems": "cadence.com",
  "dell technologies": "dell.com",
  "analog devices": "analog.com",
  "keysight technologies": "keysight.com",
  kla: "kla.com",
  "kla corporation": "kla.com",
  globalfoundries: "gf.com",
  "blue origin": "blueorigin.com",
  "t-mobile": "t-mobile.com",
  "fidelity investments": "fidelity.com",
  vanguard: "vanguard.com",
  honeywell: "honeywell.com",
  "johnson & johnson": "jnj.com",
  "procter & gamble": "pg.com",
  draftkings: "draftkings.com",
  "imc trading": "imc.com",
  drw: "drw.com",
  tencent: "tencent.com",
  fortinet: "fortinet.com",
  "applied intuition": "appliedintuition.com",
  "shield ai": "shield.ai",
  skydio: "skydio.com",
  zipline: "flyzipline.com",
};

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceRoleKey);
const logoDevKey = process.env.LOGO_DEV_SECRET_KEY;
const retryMisses = process.argv.includes("--retry-misses");

const key = (name: string) => name.trim().toLowerCase();

// "Snowflake Inc." / "snowflake" / "Snowflake, Inc" all compare equal.
const SUFFIXES = /\b(inc|llc|ltd|corp|corporation|co|company|plc|gmbh|group|holdings)\b/g;
const normalize = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, "")
    .trim();

async function selectAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function companyNames(): Promise<Map<string, string>> {
  const [lc, jobs, interns] = await Promise.all([
    selectAll<{ name: string }>("lc_companies", "name"),
    selectAll<{ company: string }>("job_postings", "company", (q) => q.eq("is_active", true)),
    selectAll<{ company: string }>("internship_postings", "company", (q) => q.eq("is_active", true)),
  ]);
  const names = new Map<string, string>(); // key -> display spelling
  for (const n of [...lc.map((r) => r.name), ...jobs.map((r) => r.company), ...interns.map((r) => r.company)]) {
    // Skip blanks and markdown artifacts like "↳" (no letters or digits).
    if (n && /[a-z0-9]/i.test(n) && !names.has(key(n))) names.set(key(n), n.trim());
  }
  return names;
}

interface SearchHit {
  name: string;
  domain: string;
}

async function lookup(name: string): Promise<string | null> {
  const res = await fetch(`https://api.logo.dev/search?q=${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${logoDevKey}` },
  });
  if (res.status === 429) throw new Error("rate limited");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const hits = (await res.json()) as SearchHit[];
  const want = normalize(name);
  const hit = hits.find((h) => normalize(h.name) === want);
  const domain = hit?.domain.toLowerCase();
  // Same shape the table's check constraint enforces.
  return domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

async function upsert(rows: { name_key: string; domain: string | null; source: string }[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("company_domains")
      .upsert(
        rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: new Date().toISOString() })),
        { onConflict: "name_key" },
      );
    if (error) throw new Error(`upsert company_domains: ${error.message}`);
  }
}

async function main() {
  await upsert(Object.entries(MANUAL).map(([name_key, domain]) => ({ name_key, domain, source: "manual" })));
  console.log(`Upserted ${Object.keys(MANUAL).length} manual domains.`);

  if (!logoDevKey) {
    console.log("LOGO_DEV_SECRET_KEY not set — skipping Logo.dev lookups for the remaining companies.");
    return;
  }

  const existing = await selectAll<{ name_key: string; domain: string | null; source: string }>(
    "company_domains",
    "name_key, domain, source",
  );
  const skip = new Set(
    existing.filter((r) => r.source === "manual" || r.domain || !retryMisses).map((r) => r.name_key),
  );
  const names = await companyNames();
  const todo = [...names].filter(([k]) => !skip.has(k)).slice(0, MAX_LOOKUPS_PER_RUN);
  console.log(`${names.size} companies, ${todo.length} to look up${todo.length === MAX_LOOKUPS_PER_RUN ? " (capped)" : ""}.`);

  const results: { name_key: string; domain: string | null; source: string }[] = [];
  let failed = 0;
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < todo.length) {
        const [k, display] = todo[i++];
        try {
          results.push({ name_key: k, domain: await lookup(display), source: "logo_dev" });
        } catch (err) {
          // Not recorded, so the next run retries it.
          failed++;
          console.warn(`  ${display}: ${(err as Error).message}`);
        }
      }
    }),
  );

  await upsert(results);
  const found = results.filter((r) => r.domain).length;
  console.log(`Looked up ${results.length}: ${found} matched, ${results.length - found} no match, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
