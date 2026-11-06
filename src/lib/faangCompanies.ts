// Our own FAANG+ list: big tech plus the top-tier tech, AI, autonomy and quant
// firms new grads target. scripts/import-job-postings.ts tags every posting
// whose company matches, whichever source it came from (no source's own
// "FAANG" labelling is used). Edit this list and the next sync (every 30
// minutes) re-tags all active postings.
//
// Matching is on normalizeCompanyName(), exact against these aliases, never
// by prefix, so look-alikes ("Apple Bank", "Snap Finance", "Cohere Health",
// "H&R Block") don't match. Subsidiaries count as their parent's brand where
// they hire under it (Annapurna Labs, Zoox and Twitch are Amazon; Waymo and
// DeepMind are Alphabet).
const FAANG_PLUS: Record<string, string[]> = {
  // FAANG / MAANG
  Meta: ["meta", "facebook", "instagram", "whatsapp", "meta reality labs"],
  Apple: ["apple"],
  Amazon: ["amazon", "amazon web services", "aws", "amazon robotics", "annapurna labs", "zoox", "twitch"],
  Netflix: ["netflix"],
  Google: ["google", "alphabet", "google deepmind", "deepmind", "youtube", "waymo"],
  // Big tech
  Microsoft: ["microsoft", "linkedin", "github"],
  NVIDIA: ["nvidia"],
  TikTok: ["tiktok", "bytedance"],
  Adobe: ["adobe"],
  Salesforce: ["salesforce", "slack"],
  Uber: ["uber"],
  Airbnb: ["airbnb"],
  Lyft: ["lyft"],
  DoorDash: ["doordash"],
  Snap: ["snap", "snapchat"],
  Pinterest: ["pinterest"],
  Roblox: ["roblox"],
  // High-growth tech
  Stripe: ["stripe"],
  Ramp: ["ramp"],
  Plaid: ["plaid"],
  Coinbase: ["coinbase"],
  Robinhood: ["robinhood", "robinhood markets"],
  Block: ["block", "square", "cash app"],
  Figma: ["figma"],
  Notion: ["notion", "notion labs"],
  Datadog: ["datadog"],
  Snowflake: ["snowflake"],
  Databricks: ["databricks"],
  Cloudflare: ["cloudflare"],
  Atlassian: ["atlassian"],
  Dropbox: ["dropbox"],
  Shopify: ["shopify"],
  Duolingo: ["duolingo"],
  Discord: ["discord"],
  Reddit: ["reddit"],
  SeatGeek: ["seatgeek"],
  // AI labs
  OpenAI: ["openai"],
  Anthropic: ["anthropic"],
  xAI: ["xai", "x ai"],
  "Scale AI": ["scale ai"],
  Perplexity: ["perplexity", "perplexity ai"],
  "Mistral AI": ["mistral ai", "mistral"],
  Cohere: ["cohere"],
  // Autonomy, defense and hard tech
  Palantir: ["palantir"],
  Anduril: ["anduril"],
  "Applied Intuition": ["applied intuition"],
  Tesla: ["tesla"],
  SpaceX: ["spacex"],
  Neuralink: ["neuralink"],
  Rivian: ["rivian", "rivian and volkswagen"],
  Nuro: ["nuro"],
  Aurora: ["aurora innovation"],
  // Quant and trading
  "Jane Street": ["jane street", "jane street capital"],
  Citadel: ["citadel", "citadel securities"],
  "Two Sigma": ["two sigma", "two sigma investments"],
  "Hudson River Trading": ["hudson river trading", "hrt"],
  "Jump Trading": ["jump trading"],
  "D. E. Shaw": ["d e shaw", "de shaw"],
  Optiver: ["optiver"],
  IMC: ["imc", "imc trading"],
  SIG: ["susquehanna international", "susquehanna", "sig"],
  Bloomberg: ["bloomberg", "bloomberg lp"],
};

const CORPORATE_SUFFIX =
  / (inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|lp|l p|technologies|technology|industries|group|holdings|platforms)$/;

// "The D. E. Shaw Group" -> "d e shaw", "Palantir Technologies Inc." ->
// "palantir", "Amazon Web Services (AWS)" -> "amazon web services".
export function normalizeCompanyName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
  while (CORPORATE_SUFFIX.test(s)) s = s.replace(CORPORATE_SUFFIX, "");
  return s;
}

const ALIASES = new Set(Object.values(FAANG_PLUS).flat());

export function isFaangPlusCompany(company: string | null | undefined): boolean {
  return !!company && ALIASES.has(normalizeCompanyName(company));
}
