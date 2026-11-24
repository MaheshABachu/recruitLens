import { normalizeCompanyName } from "./faangCompanies";

// Defense contractors and defense tech, for the job alerts' "Block defense
// tech" switch (alert_preferences.exclude_defense). Built from the company
// spellings in job_postings / internship_postings on 2026-11-24.
//
// Matching is on normalizeCompanyName(). An alias ending in "*" also matches
// longer names that start with it ("northrop grumman*" catches "Northrop
// Grumman UK"); others must match exactly, so "Mercury Insurance" and
// "Huntington Bank" stay out. Any name with the word "defense" counts too,
// minus DEFENSE_WORD_EXCEPTIONS.
const DEFENSE: Record<string, string[]> = {
  "Lockheed Martin": ["lockheed martin*", "lockheed*"],
  "Northrop Grumman": ["northrop grumman*"],
  "RTX / Raytheon": ["rtx", "raytheon*", "collins aerospace*", "pratt and whitney*"],
  "General Dynamics": ["general dynamics*", "gdit", "electric boat", "bath iron works"],
  "L3Harris": ["l3harris*", "l3 harris*"],
  Boeing: ["boeing*"],
  "BAE Systems": ["bae systems*"],
  HII: ["hii", "huntington ingalls*", "mission technologies a division of hii", "newport news shipbuilding*"],
  Leidos: ["leidos*"],
  "Booz Allen": ["booz allen*"],
  CACI: ["caci*"],
  SAIC: ["saic", "science applications international*"],
  Peraton: ["peraton*"],
  Amentum: ["amentum*"],
  V2X: ["v2x"],
  ManTech: ["mantech*"],
  Parsons: ["parsons"],
  KBR: ["kbr", "kbr careers"],
  "Leonardo DRS": ["leonardo", "leonardo drs*"],
  Textron: ["textron", "textron systems*"],
  "Curtiss-Wright": ["curtiss wright*"],
  "Mercury Systems": ["mercury systems*"],
  "Teledyne Brown Engineering": ["teledyne brown engineering"],
  Kratos: ["kratos*"],
  AeroVironment: ["aerovironment*"],
  Elbit: ["elbit*"],
  "Sierra Nevada": ["sierra nevada*"],
  "DCS Corp": ["dcs"],
  Palantir: ["palantir*"],
  Anduril: ["anduril*"],
  "Shield AI": ["shield ai*"],
  Saronic: ["saronic*"],
  Epirus: ["epirus*"],
  Castelion: ["castelion*"],
  Hermeus: ["hermeus*"],
  "Mach Industries": ["mach industries*"],
  Neros: ["neros*"],
  "True Anomaly": ["true anomaly*"],
  Skydio: ["skydio*"],
  Forterra: ["forterra*"],
  "Ursa Major": ["ursa major*"],
  "Vannevar Labs": ["vannevar labs*"],
  "Rebellion Defense": ["rebellion defense*"],
  // Defense research labs and FFRDCs
  MITRE: ["mitre*"],
  "Johns Hopkins APL": ["johns hopkins applied physics laboratory*", "jhu apl", "jhuapl"],
  "MIT Lincoln Laboratory": ["mit lincoln laboratory*", "lincoln laboratory*"],
  Draper: ["draper", "draper laboratory*", "charles stark draper laboratory*"],
  "The Aerospace Corporation": ["aerospace"],
  "Sandia National Laboratories": ["sandia*"],
  "Lawrence Livermore National Laboratory": ["lawrence livermore national laboratory*"],
  "Los Alamos National Laboratory": ["los alamos national laboratory*"],
  "Naval Nuclear Laboratory": ["naval nuclear laboratory*"],
};

const DEFENSE_WORD_EXCEPTIONS = new Set(["environmental defense fund"]);

// Group names, for the switch's "Covers …" line.
export const DEFENSE_COMPANY_NAMES = Object.keys(DEFENSE);

const EXACT = new Set<string>();
const PREFIXES: string[] = [];
for (const alias of Object.values(DEFENSE).flat()) {
  if (alias.endsWith("*")) {
    const base = alias.slice(0, -1);
    EXACT.add(base);
    PREFIXES.push(`${base} `);
  } else {
    EXACT.add(alias);
  }
}

export function isDefenseCompany(company: string | null | undefined): boolean {
  if (!company) return false;
  const name = normalizeCompanyName(company);
  if (!name) return false;
  if (EXACT.has(name) || PREFIXES.some((p) => name.startsWith(p))) return true;
  return /(^| )defen[cs]e( |$)/.test(name) && !DEFENSE_WORD_EXCEPTIONS.has(name);
}
