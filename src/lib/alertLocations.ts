// Places the job-alerts intake suggests for "Locations". Posting locations are
// free text and inconsistent across sources ("NYC" / "New York City, NY" /
// "New York, NY, United States", "SF" / "San Francisco, CA", the Bay Area split
// over a dozen towns), so each place carries the spellings that count as it.
// alert_preferences.locations stores the place's label; send-alerts (phase 2)
// matches with locationMatches(), which also handles free-text entries.

export interface AlertPlace {
  label: string;
  // Lowercase words/phrases matched on word boundaries against the posting
  // location; a leading "=" means the whole location must equal it ("=la" is
  // Los Angeles, but ", LA" elsewhere is Louisiana).
  aliases: string[];
}

// Areas that span several towns, plus the two cities known by a nickname.
const AREAS: AlertPlace[] = [
  { label: "Remote", aliases: ["remote"] },
  {
    label: "SF Bay Area",
    aliases: [
      "bay area", "sf", "san francisco", "san jose", "palo alto", "santa clara", "sunnyvale", "mountain view",
      "san mateo", "milpitas", "menlo park", "redwood city", "cupertino", "oakland", "fremont", "foster city",
      "south san francisco", "burlingame", "san carlos", "berkeley", "emeryville", "los gatos", "pleasanton",
      "los altos", "livermore",
    ],
  },
  { label: "San Francisco", aliases: ["sf", "san francisco"] },
  { label: "New York City", aliases: ["nyc", "new york", "manhattan", "brooklyn"] },
  { label: "Seattle area", aliases: ["seattle", "redmond", "bellevue", "kirkland", "bothell"] },
  {
    label: "Los Angeles area",
    aliases: ["=la", "los angeles", "el segundo", "santa monica", "culver city", "playa vista", "pasadena", "irvine", "long beach", "hawthorne", "torrance", "costa mesa"],
  },
  { label: "Boston area", aliases: ["boston", "cambridge, ma", "somerville", "waltham", "burlington, ma", "andover, ma", "wilmington, ma", "westford, ma", "marlborough, ma"] },
  {
    label: "Washington DC area",
    aliases: ["washington, dc", "washington dc", "dc", "arlington, va", "mclean", "reston", "herndon", "tysons", "chantilly", "vienna, va", "manassas", "bethesda", "laurel, md", "columbia, md", "annapolis junction"],
  },
  { label: "Dallas area", aliases: ["dallas", "plano", "irving", "fort worth", "richardson", "frisco"] },
  { label: "Denver / Boulder area", aliases: ["denver", "boulder", "broomfield", "golden, co", "westminster, co"] },
  { label: "Raleigh-Durham area", aliases: ["raleigh", "durham", "cary", "research triangle", "morrisville"] },
  { label: "Salt Lake City area", aliases: ["salt lake city", "lehi", "provo", "draper"] },
  { label: "Phoenix area", aliases: ["phoenix", "tempe", "scottsdale", "chandler"] },
  { label: "Portland area", aliases: ["portland, or", "hillsboro", "beaverton"] },
  { label: "Minneapolis area", aliases: ["minneapolis", "st. paul", "saint paul", "bloomington, mn", "eden prairie"] },
  { label: "Detroit area", aliases: ["detroit", "ann arbor", "dearborn", "warren, mi"] },
  { label: "Toronto area", aliases: ["toronto", "markham", "mississauga"] },
];

// Single cities, most postings first: every "City, ST" with 15+ active
// postings on 2026-11-14 (New York / San Francisco live under AREAS). Each
// matches "City, ST" or "City, <state name>". Refresh from the same query:
//   split locations on ; | /, take "^City, XX", count, order by count desc.
const CITIES = [
  "San Jose, CA", "Seattle, WA", "London, UK", "Austin, TX", "Chicago, IL", "Santa Clara, CA", "Palo Alto, CA",
  "Toronto, ON", "Sunnyvale, CA", "Boston, MA", "Redmond, WA", "Dallas, TX", "Atlanta, GA", "San Diego, CA",
  "Mountain View, CA", "Washington, DC", "Cambridge, MA", "Ottawa, ON", "Bellevue, WA", "Pittsburgh, PA",
  "Huntsville, AL", "San Mateo, CA", "Cincinnati, OH", "Bristol, UK", "El Segundo, CA", "Houston, TX",
  "Vancouver, BC", "Laurel, MD", "Denver, CO", "Irvine, CA", "Milpitas, CA", "Boise, ID", "Durham, NC",
  "Cedar Rapids, IA", "Montreal, QC", "Menlo Park, CA", "Richardson, TX", "Colorado Springs, CO", "Markham, ON",
  "McLean, VA", "Annapolis Junction, MD", "Milwaukee, WI", "Cary, NC", "Tucson, AZ", "Cambridge, UK",
  "Reston, VA", "Wilmington, MA", "Phoenix, AZ", "Scottsdale, AZ", "Fort Collins, CO", "Charlotte, NC",
  "Cupertino, CA", "Rochester, NY", "Philadelphia, PA", "Plano, TX", "Madison, WI", "Hawthorne, CA", "Vienna, VA",
  "Herndon, VA", "Edinburgh, UK", "Jacksonville, FL", "Indianapolis, IN", "Bloomington, MN", "Spring, TX",
  "Miami, FL", "Chantilly, VA", "St. Louis, MO", "Golden, CO", "Tampa, FL", "Los Angeles, CA", "Hillsboro, OR",
  "Irving, TX", "Andover, MA", "Boulder, CO", "Knoxville, TN", "Olathe, KS", "Orlando, FL", "Redwood City, CA",
  "Santa Rosa, CA", "Columbus, OH", "Ann Arbor, MI", "Raleigh, NC", "Manassas, VA", "Detroit, MI",
  "State College, PA", "Chippewa Falls, WI", "Los Altos, CA", "Alpharetta, GA", "Torrance, CA", "Westford, MA",
  "Fremont, CA", "Nashville, TN", "Arlington, VA", "Eden Prairie, MN", "Jersey City, NJ", "Niles, IL",
  "Burlingame, CA", "Minneapolis, MN", "Salt Lake City, UT", "Delaware, OH", "Mississauga, ON", "Beavercreek, OH",
  "Roseville, CA", "Newcastle upon Tyne, UK", "Waltham, MA", "San Antonio, TX", "Foster City, CA", "Tempe, AZ",
  "Glasgow, UK", "Newark, NJ", "Livermore, CA", "Lansing, MI", "Somerville, MA", "Calgary, AB", "Des Moines, IA",
  "Hartford, CT", "Costa Mesa, CA", "Manchester, UK", "Buffalo, NY", "Warren, MI", "Louisville, KY",
  "Westminster, CO", "Kirkland, WA", "Dayton, OH", "Honolulu, HI", "Melbourne, FL", "Marlborough, MA",
];

const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

// States as places too ("Texas" matches ", TX" and "Texas"). A state's places
// above also count, e.g. California catches "SF" and "LA".
const STATE_PLACES: (AlertPlace & { code: string })[] = US_STATES.map(([code, name]) => ({
  label: `${name} (state)`,
  code,
  // "Washington" alone would catch "Washington, DC"; the state goes by ", WA" and Seattle.
  aliases: code === "WA" ? [] : [name.toLowerCase()],
}));

// Nickname-only spellings ("SF", "LA", "NYC") still count for their state.
const STATE_CITY_LABELS: Record<string, string[]> = {
  CA: ["SF Bay Area", "Los Angeles area"],
  NY: ["New York City"],
  WA: ["Seattle area"],
};

const STATE_NAME = new Map(US_STATES);

const CITY_PLACES: AlertPlace[] = CITIES.map((label) => {
  const [city, code] = label.split(", ");
  const stateName = STATE_NAME.get(code);
  const aliases = [label.toLowerCase()];
  if (stateName) aliases.push(`${city}, ${stateName}`.toLowerCase());
  if (code === "UK") aliases.push(`${city}, england`.toLowerCase(), `${city}, united kingdom`.toLowerCase());
  return { label, aliases };
});

export const ALERT_PLACES: AlertPlace[] = [...AREAS, ...CITY_PLACES];

// Everything the Locations field suggests: areas, then cities by posting
// count, then states. The typeahead keeps this order within prefix matches.
export const LOCATION_SUGGESTIONS: string[] = [...ALERT_PLACES.map((p) => p.label), ...STATE_PLACES.map((p) => p.label)];

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The job boards' location filter runs this per posting, so compiled patterns are kept.
const PHRASE_PATTERNS = new Map<string, RegExp>();

function phraseMatches(location: string, phrase: string) {
  let pattern = PHRASE_PATTERNS.get(phrase);
  if (!pattern) {
    pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(phrase)}($|[^a-z0-9])`, "i");
    PHRASE_PATTERNS.set(phrase, pattern);
  }
  return pattern.test(location);
}

function placeMatches(location: string, place: AlertPlace) {
  return place.aliases.some((alias) =>
    alias.startsWith("=") ? location.trim().toLowerCase() === alias.slice(1) : phraseMatches(location, alias),
  );
}

// Does a posting's location satisfy one of the user's location entries?
// Known labels use their aliases; free text matches as a whole word/phrase
// ("CA" matches "San Jose, CA" but not "Chicago").
export function locationMatches(postingLocation: string | null, entry: string): boolean {
  if (!postingLocation) return false;
  const place = ALERT_PLACES.find((p) => p.label === entry);
  if (place) return placeMatches(postingLocation, place);
  const state = STATE_PLACES.find((s) => s.label === entry);
  if (state) {
    if (new RegExp(`,\\s*${state.code}\\b`).test(postingLocation)) return true;
    if (placeMatches(postingLocation, state)) return true;
    return (STATE_CITY_LABELS[state.code] ?? []).some((label) =>
      placeMatches(postingLocation, ALERT_PLACES.find((p) => p.label === label)!),
    );
  }
  return phraseMatches(postingLocation, entry.trim());
}
