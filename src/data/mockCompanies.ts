import type { Company } from "../types/pipeline";

/**
 * Static seed data, shaped like the eventual DB rows. Deliberately covers
 * every UI state: multi-role companies, single-role companies, every
 * PipelineStatus, priority flags, and roles with sparse/missing fields so
 * empty-state styling has something to render against.
 */
export const mockCompanies: Company[] = [
  {
    id: "stripe",
    name: "Stripe",
    group: "FINTECH",
    tier: "Tier 1",
    problems: 42,
    priority: true,
    roles: [
      {
        role: "Software Engineer, Infrastructure",
        status: "Onsite",
        nextAction: "System design round",
        nextDate: "2026-08-21",
        recruiter: "Dana Whitfield",
        format: "Virtual · 4 rounds",
        style: "Coding + system design",
        notes: "Panel mentioned migrating a queue service off Kafka — good to have opinions ready.",
        resumeUsed: "stripe_infra_v3.pdf",
        resumeMatch: 88,
        coverLetterUsed: "stripe_cover.pdf",
      },
      {
        role: "Software Engineer, Payments Platform",
        status: "Applied",
        nextAction: "Awaiting recruiter response",
      },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    group: "AI / ML",
    tier: "Tier 1",
    problems: 31,
    priority: true,
    roles: [
      {
        role: "Member of Technical Staff",
        status: "Phone Screen",
        nextAction: "Recruiter screen",
        nextDate: "2026-08-18",
        recruiter: "Priya Sundaram",
        format: "Virtual · 30 min",
        resumeUsed: "anthropic_mts.pdf",
        resumeMatch: 91,
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    group: "AI / ML",
    tier: "Tier 1",
    problems: 18,
    priority: false,
    roles: [
      {
        role: "Research Engineer",
        status: "OA",
        nextAction: "Submit online assessment",
        nextDate: "2026-08-17",
        format: "Async · 3 hrs",
        style: "Algorithms + ML systems",
      },
    ],
  },
  {
    id: "google",
    name: "Google",
    group: "BIG TECH",
    tier: "Tier 1",
    problems: 67,
    priority: false,
    roles: [
      {
        role: "Software Engineer III",
        status: "Rejected",
        nextAction: undefined,
        notes: "Didn't pass the second onsite loop — revisit in 6 months per recruiter.",
      },
      {
        role: "Site Reliability Engineer",
        status: "Not Applied",
      },
    ],
  },
  {
    id: "meta",
    name: "Meta",
    group: "BIG TECH",
    tier: "Tier 1",
    problems: 54,
    priority: false,
    roles: [
      {
        role: "Software Engineer, Reality Labs",
        status: "Applied",
        nextAction: "Awaiting recruiter response",
        nextDate: "2026-08-25",
      },
    ],
  },
  {
    id: "amazon",
    name: "Amazon",
    group: "BIG TECH",
    tier: "Tier 2",
    problems: 39,
    priority: false,
    roles: [
      {
        role: "SDE II",
        status: "Not Applied",
      },
    ],
  },
  {
    id: "ramp",
    name: "Ramp",
    group: "FINTECH",
    tier: "Tier 2",
    problems: 12,
    priority: false,
    roles: [
      {
        role: "Full-Stack Engineer",
        status: "Offer",
        nextAction: "Respond to offer",
        nextDate: "2026-08-29",
        recruiter: "Tom Nakashima",
        format: "Virtual · 3 rounds",
        style: "Take-home + pairing",
        notes: "Base + equity in writing. Ask about refresher cadence before signing.",
        resumeUsed: "ramp_fullstack.pdf",
        resumeMatch: 95,
        coverLetterUsed: "ramp_cover.pdf",
      },
    ],
  },
  {
    id: "brex",
    name: "Brex",
    group: "FINTECH",
    tier: "Tier 2",
    problems: 9,
    priority: false,
    roles: [
      {
        role: "Backend Engineer",
        status: "Phone Screen",
        nextAction: "Hiring manager call",
        nextDate: "2026-08-19",
        recruiter: "Elena Vasquez",
        format: "Virtual · 45 min",
      },
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    group: "STARTUPS",
    tier: "Tier 2",
    problems: 6,
    priority: true,
    roles: [
      {
        role: "Frontend Infrastructure Engineer",
        status: "OA",
        nextAction: "Take-home project due",
        nextDate: "2026-08-20",
        style: "Take-home",
        resumeUsed: "vercel_frontend.pdf",
        resumeMatch: 82,
      },
    ],
  },
  {
    id: "linear",
    name: "Linear",
    group: "STARTUPS",
    tier: "Tier 2",
    problems: 3,
    priority: false,
    roles: [
      {
        role: "Product Engineer",
        status: "Not Applied",
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    group: "STARTUPS",
    tier: "Tier 2",
    problems: 14,
    priority: false,
    roles: [
      {
        role: "Software Engineer, Core",
        status: "Applied",
        nextAction: "Awaiting recruiter response",
        nextDate: "2026-08-24",
      },
    ],
  },
];
