import { useState } from "react";
import { useLandingStats } from "../../hooks/useLandingStats";
import { ThemeToggle } from "../layout/ThemeToggle";
import { Logo } from "../shared/Logo";
import { AuthDialog } from "../auth/AuthDialog";
import type { AuthMode } from "../auth/AuthForm";
import type { LandingStats } from "../../lib/landingStats";
import { CHARITY, DONATION_SHARE, FREE_TRIAL_DAYS, PRICE_MONTHLY } from "../../lib/billing";

// LeetCode Premium's regular monthly price as of Oct 2026 (it's running a
// discount right now; compare against the list price). Update here if it
// changes — the receipt and savings line derive from it.
const LEETCODE_PREMIUM_MONTHLY = 39;
const DONATION_PER_MONTH = PRICE_MONTHLY * DONATION_SHARE;
const DONATION_PERCENT = Math.round(DONATION_SHARE * 100);

const FALLBACK_COMPANY_COUNT = 470;

function formatDollars(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function statsSentence({ companies, questions, activeJobs }: LandingStats) {
  const parts = [`${(companies ?? FALLBACK_COMPANY_COUNT).toLocaleString()} companies`];
  if (questions !== null) parts.push(`${questions.toLocaleString()} tagged questions`);
  if (activeJobs !== null) parts.push(`${activeJobs.toLocaleString()} open new-grad roles`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const SAMPLE_QUESTIONS: {
  name: string;
  topics: string;
  difficulty: "easy" | "medium" | "hard";
  frequency: number;
  solved: boolean;
}[] = [
  { name: "LRU Cache", topics: "Hash Table, Linked List, Design", difficulty: "medium", frequency: 92.4, solved: true },
  { name: "Number of Islands", topics: "Graph, BFS, DFS", difficulty: "medium", frequency: 88.1, solved: true },
  { name: "Trapping Rain Water", topics: "Two Pointers, Stack", difficulty: "hard", frequency: 81.7, solved: false },
  { name: "Two Sum", topics: "Array, Hash Table", difficulty: "easy", frequency: 77.0, solved: true },
  { name: "Merge k Sorted Lists", topics: "Heap, Linked List", difficulty: "hard", frequency: 70.3, solved: false },
];

const JOB_SOURCES: { name: string; jobs: { company: string; dup?: boolean }[] }[] = [
  { name: "Jobright", jobs: [{ company: "Ramp" }, { company: "Stripe", dup: true }, { company: "Notion" }] },
  { name: "SpeedyApply", jobs: [{ company: "Stripe", dup: true }, { company: "Datadog" }] },
  { name: "Simplify", jobs: [{ company: "Figma" }, { company: "Ramp", dup: true }, { company: "Plaid" }] },
];

const FEED: { company: string; title: string; sources: number }[] = [
  { company: "Stripe", title: "Software Engineer, New Grad", sources: 2 },
  { company: "Ramp", title: "Software Engineer I", sources: 2 },
  { company: "Datadog", title: "Software Engineer, Early Career", sources: 1 },
  { company: "Figma", title: "New Grad Engineer", sources: 1 },
];

export function LandingPage() {
  const stats = useLandingStats();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const monthlySavings = LEETCODE_PREMIUM_MONTHLY - PRICE_MONTHLY;
  const openSignUp = () => setAuthMode("sign-up");

  return (
    <div className="landing">
      <header className="landing__nav">
        <Logo />
        <div className="landing__nav-actions">
          <ThemeToggle />
          <button type="button" className="landing-btn landing-btn--ghost" onClick={() => setAuthMode("sign-in")}>
            Sign in
          </button>
          <button type="button" className="landing-btn landing-btn--primary" onClick={openSignUp}>
            Sign up
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <h1 className="landing-hero__title">
              LeetCode Premium is too expensive.
              <br />
              So we made our own.
            </h1>
            <p className="landing-hero__lede">
              Company-tagged interview questions and every new-grad job posting, in one place. ${PRICE_MONTHLY} a
              month after a free week, and {DONATION_PERCENT}% of it supports undocumented students in Central Texas.
            </p>
            <div className="landing-hero__ctas">
              <button type="button" className="landing-btn landing-btn--primary" onClick={openSignUp}>
                Start your free week
              </button>
              <a className="landing-btn landing-btn--ghost" href="#pricing">
                See what's included
              </a>
            </div>
          </div>

          <figure className="landing-receipt" aria-label="Monthly price comparison">
            <div className="landing-receipt__head">Your monthly prep bill</div>
            <dl className="landing-receipt__lines">
              <div className="landing-receipt__line landing-receipt__line--struck">
                <dt>LeetCode Premium</dt>
                <dd>
                  <s>{formatDollars(LEETCODE_PREMIUM_MONTHLY)}</s>
                </dd>
              </div>
              <div className="landing-receipt__line">
                <dt>Vantage</dt>
                <dd>{formatDollars(PRICE_MONTHLY)}</dd>
              </div>
              <div className="landing-receipt__line landing-receipt__line--muted landing-receipt__line--sub">
                <dt>to {CHARITY.name}</dt>
                <dd>{formatDollars(DONATION_PER_MONTH)}</dd>
              </div>
              <div className="landing-receipt__line landing-receipt__line--muted">
                <dt>First {FREE_TRIAL_DAYS} days</dt>
                <dd>{formatDollars(0)}</dd>
              </div>
            </dl>
            <div className="landing-receipt__total">
              <span>You keep</span>
              <span>
                {formatDollars(monthlySavings)}
                <small>/mo</small>
              </span>
            </div>
            <figcaption className="landing-receipt__note">
              LeetCode Premium monthly plan at its regular price, October 2026.
            </figcaption>
          </figure>
        </section>

        <p className="landing-stats">
          {statsSentence(stats)}. <span>Refreshed every day.</span>
        </p>

        <section className="landing-feature">
          <div className="landing-feature__copy">
            <h2 className="landing-feature__title">Know what each company actually asks.</h2>
            <p className="landing-feature__body">
              Pick a company and see the questions its interviewers have been asking, ranked by how often they come
              up. The same company tags Premium charges for.
            </p>
            <ul className="landing-list">
              <li>Narrow by when it was asked: last 30 days, 3 months, 6 months or all time</li>
              <li>Filter by topic, from Arrays to Dynamic Programming</li>
              <li>Connect your LeetCode account and your solved problems check themselves off</li>
              <li>Pin your target companies and mark the ones you're interviewing with</li>
            </ul>
          </div>

          <div className="landing-mock" aria-hidden="true">
            <div className="landing-mock__bar">
              <span className="landing-mock__company">Google</span>
              <span className="landing-mock__windows">
                <span className="landing-mock__window landing-mock__window--active">30 days</span>
                <span className="landing-mock__window">3 months</span>
                <span className="landing-mock__window">All time</span>
              </span>
            </div>
            <ul className="landing-mock__rows">
              {SAMPLE_QUESTIONS.map((q) => (
                <li key={q.name} className="landing-mock__row">
                  <span className={`landing-mock__check ${q.solved ? "landing-mock__check--solved" : ""}`}>
                    {q.solved && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 12.5l4.5 4.5L19 7"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className={`landing-mock__difficulty landing-mock__difficulty--${q.difficulty}`}>
                    {q.difficulty}
                  </span>
                  <span className="landing-mock__main">
                    <span className="landing-mock__name">{q.name}</span>
                    <span className="landing-mock__topics">{q.topics}</span>
                  </span>
                  <span className="landing-mock__freq">
                    <span className="landing-mock__freq-bar" style={{ width: `${q.frequency}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-feature landing-feature--flip">
          <div className="landing-feature__copy">
            <h2 className="landing-feature__title">Three job lists. One feed.</h2>
            <p className="landing-feature__body">
              New-grad roles get posted to three different GitHub lists. We pull all three every day and merge them,
              so a role that shows up twice is listed once.
            </p>
            <ul className="landing-list">
              <li>Skip roles that need US citizenship or won't sponsor a visa</li>
              <li>Filter by remote, hybrid or on-site</li>
              <li>Closed postings drop off on their own</li>
            </ul>
          </div>

          <div className="landing-merge" aria-hidden="true">
            <div className="landing-merge__sources">
              {JOB_SOURCES.map((source) => (
                <div key={source.name} className="landing-merge__source">
                  <span className="landing-merge__source-name">{source.name}</span>
                  {source.jobs.map((job) => (
                    <span
                      key={job.company}
                      className={`landing-merge__chip ${job.dup ? "landing-merge__chip--dup" : ""}`}
                    >
                      {job.company}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <svg className="landing-merge__arrow" viewBox="0 0 40 120" preserveAspectRatio="none">
              <path d="M2 10 C 24 10, 16 60, 38 60 M2 60 L38 60 M2 110 C 24 110, 16 60, 38 60" />
            </svg>
            <ul className="landing-merge__feed">
              {FEED.map((job) => (
                <li key={job.company} className="landing-merge__job">
                  <span className="landing-merge__job-company">{job.company}</span>
                  <span className="landing-merge__job-title">{job.title}</span>
                  {job.sources > 1 && <span className="landing-merge__badge">On {job.sources} lists</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-cause">
          <div className="landing-cause__copy">
            <h2 className="landing-feature__title">
              {DONATION_PERCENT}% of what we make goes to {CHARITY.name}.
            </h2>
            <p className="landing-feature__body">
              Rooted is an immigrant collective in Austin, Texas that supports undocumented students across Central
              Texas. Your subscription funds their work every month you stay.
            </p>
            <a className="landing-cause__link" href={CHARITY.url} target="_blank" rel="noreferrer">
              Learn about Rooted
            </a>
          </div>
        </section>

        <section className="landing-pricing" id="pricing">
          <h2 className="landing-pricing__title">One plan. Everything in it.</h2>
          <div className="landing-plan">
            <div className="landing-plan__price">
              <span className="landing-plan__amount">${PRICE_MONTHLY}</span>
              <span className="landing-plan__period">per month</span>
            </div>
            <p className="landing-plan__trial">Your first {FREE_TRIAL_DAYS} days are free.</p>
            <ul className="landing-list landing-list--plan">
              <li>Company-tagged questions for {(stats.companies ?? FALLBACK_COMPANY_COUNT).toLocaleString()} companies</li>
              <li>Frequency by time window and topic filters</li>
              <li>Automatic solved tracking from your LeetCode account</li>
              <li>The merged new-grad job feed, updated daily</li>
            </ul>
            <button type="button" className="landing-btn landing-btn--primary landing-btn--block" onClick={openSignUp}>
              Start your free week
            </button>
            <p className="landing-plan__fine">
              Cancel anytime. {DONATION_PERCENT}% of revenue goes to {CHARITY.name}.
            </p>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Vantage</span>
        <span>Not affiliated with LeetCode.</span>
      </footer>

      <AuthDialog mode={authMode} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} />
    </div>
  );
}
