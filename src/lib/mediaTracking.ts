// Mock data only — there's no real scraping pipeline behind this yet. Shape
// is deliberately close to what a real "posts mentioning this company" feed
// would look like, so swapping in a live source later is a data-layer change,
// not a UI rewrite.
export type MediaSource = "reddit" | "discord";

export interface MediaPost {
  id: string;
  source: MediaSource;
  channel: string;
  snippet: string;
  timeAgo: string;
}

const SNIPPET_TEMPLATES: { source: MediaSource; channel: string; text: (name: string) => string; timeAgo: string }[] = [
  {
    source: "reddit",
    channel: "r/cscareerquestions",
    text: (name) => `Anyone else interviewing at ${name} this week? OA had two mediums, curious what the onsite loop looks like.`,
    timeAgo: "3h ago",
  },
  {
    source: "discord",
    channel: "#interview-prep",
    text: (name) => `${name} recruiter reached out about a new grad SWE role — sounds like the timeline moves fast.`,
    timeAgo: "6h ago",
  },
  {
    source: "reddit",
    channel: "r/leetcode",
    text: (name) => `Wrote up my ${name} onsite loop from last month — mostly graph traversal and DP, one system design round.`,
    timeAgo: "1d ago",
  },
  {
    source: "discord",
    channel: "#big-tech-grind",
    text: (name) => `Does anyone have a referral for ${name}? Applying this week before the req closes.`,
    timeAgo: "2d ago",
  },
  {
    source: "reddit",
    channel: "r/ExperiencedDevs",
    text: (name) => `Team at ${name} seems to be hiring aggressively right now — recruiter DMs have picked up a lot lately.`,
    timeAgo: "4d ago",
  },
];

export function getMockMediaPosts(companyName: string): MediaPost[] {
  return SNIPPET_TEMPLATES.map((t, i) => ({
    id: `${companyName}-${i}`,
    source: t.source,
    channel: t.channel,
    snippet: t.text(companyName),
    timeAgo: t.timeAgo,
  }));
}
