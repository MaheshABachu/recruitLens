import { useEffect, type ReactNode } from "react";
import { CHARITY, DONATION_SHARE, FREE_TRIAL_DAYS, PLANS } from "../../lib/billing";
import { LEGAL, type LegalDoc } from "../../lib/legal";
import { ThemeToggle } from "../layout/ThemeToggle";
import { Logo } from "../shared/Logo";

// /terms and /privacy. Rendered from main.tsx before the app (no router), so
// they work signed in or out. Drafts — see src/lib/legal.ts.

const DONATION_PERCENT = Math.round(DONATION_SHARE * 100);
const PLAN_LIST = PLANS.map((p) => `$${p.price} ${p.period}`).join(", ");
const Email = () => <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Terms() {
  return (
    <>
      <Section title="1. The service">
        <p>
          {LEGAL.serviceName} ({LEGAL.siteUrl}) is operated by {LEGAL.operator} ("we", "us"). It collects software
          engineering internship and new-grad job postings from third-party sources, shows company-tagged interview
          questions, and can track your solved problems from a LeetCode username you provide. By creating an account
          or using the service you agree to these terms.
        </p>
      </Section>
      <Section title="2. Eligibility and accounts">
        <p>
          You must be at least 13 years old, and at least 18 (or have a parent or guardian's permission) to buy a
          subscription. Keep your login secure; you're responsible for activity on your account. One person per
          account; don't share or resell access.
        </p>
      </Section>
      <Section title="3. Free trial, subscriptions and billing">
        <p>
          New accounts get {FREE_TRIAL_DAYS} days of free access with no payment details required. After that,
          continued access requires a paid subscription. Current plans: {PLAN_LIST}. Prices are in US dollars and may
          include taxes where applicable.
        </p>
        <p>
          Payments are processed by Stripe. Subscriptions renew automatically at the end of each billing period until
          you cancel. You can cancel at any time from Manage billing in your account menu; you keep access until the
          end of the period you've paid for, and you won't be charged again.
        </p>
        <p>
          Payments are non-refundable, including for partially used periods, except where the law requires otherwise.
          If you believe you were charged in error, email <Email /> within 14 days of the charge.
        </p>
        <p>
          We may change prices with advance notice. A change applies from your next billing period after the notice,
          and you can cancel before it takes effect.
        </p>
      </Section>
      <Section title="4. Donations">
        <p>
          We commit to donating {DONATION_PERCENT}% of subscription revenue to {CHARITY.name}. This is a donation made
          by us; your payment is not a charitable contribution and is not tax-deductible.
        </p>
      </Section>
      <Section title="5. Third-party content">
        <p>
          Job postings come from third-party sources and the question data from public community datasets. We don't
          verify every posting and don't guarantee that information is accurate, complete or current, that a role is
          still open, or anything about sponsorship, pay or hiring outcomes. Always confirm details with the employer.
          Links to other sites are provided for convenience; we're not responsible for their content.
        </p>
        <p>
          {LEGAL.serviceName} is not affiliated with, endorsed by or sponsored by LeetCode or any company shown in the
          service. Company names and logos belong to their owners and are used only to identify them.
        </p>
      </Section>
      <Section title="6. Acceptable use">
        <p>
          Don't scrape, copy, download in bulk, resell or redistribute the service or its data; don't access it with
          automated tools other than an ordinary web browser; don't try to get around the paywall, security or rate
          limits; and don't use the service for anything unlawful.
        </p>
      </Section>
      <Section title="7. Ending your account">
        <p>
          You can delete your account at any time from your account menu; this cancels any subscription immediately
          and permanently deletes your data as described in the Privacy Policy. We may suspend or close accounts that
          break these terms.
        </p>
      </Section>
      <Section title="8. Disclaimers and liability">
        <p>
          The service is provided "as is" and "as available", without warranties of any kind, to the extent the law
          allows. To the extent the law allows, we aren't liable for indirect, incidental or consequential damages,
          and our total liability for any claim is limited to the amount you paid us in the 12 months before it.
        </p>
      </Section>
      <Section title="9. Changes and governing law">
        <p>
          We may update these terms; we'll post the new version here and, for material changes, notify you by email or
          in the app. Continuing to use the service after a change means you accept it. These terms are governed by
          the laws of {LEGAL.governingLaw}, without regard to conflict-of-law rules.
        </p>
      </Section>
      <Section title="10. Contact">
        <p>
          Questions: <Email />.
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account:</strong> your email address and a password (stored hashed by our auth provider), or, if
            you sign in with Google, the name, email and profile picture Google shares.
          </li>
          <li>
            <strong>LeetCode:</strong> the username you provide and its public profile data, such as recently solved
            problems and solve counts.
          </li>
          <li>
            <strong>Preferences:</strong> companies you pin or mark as in-process, and whether you've finished the
            onboarding tour.
          </li>
          <li>
            <strong>Billing:</strong> your subscription status and plan. Card details go directly to Stripe; we never
            see or store them.
          </li>
          <li>
            <strong>Usage:</strong> pages viewed, page performance and basic device information through
            privacy-friendly, cookieless analytics.
          </li>
          <li>
            <strong>On your device:</strong> your sign-in session, theme choice and a cache of job and question data
            are kept in your browser's storage. We don't use advertising cookies.
          </li>
        </ul>
      </Section>
      <Section title="How we use it">
        <p>
          To provide the service (sign-in, syncing your LeetCode progress, saving your preferences), process payments,
          send account emails such as password resets, keep the service secure, and understand how it's used so we can
          improve it. We don't sell your personal information or use it for advertising.
        </p>
      </Section>
      <Section title="Who we share it with">
        <p>Only the service providers that run the product, each limited to what they need:</p>
        <ul>
          <li>Supabase (database, authentication and server functions)</li>
          <li>Stripe (payments)</li>
          <li>Vercel (hosting and analytics)</li>
          <li>Google (if you choose Google sign-in)</li>
          <li>LeetCode (we look up the public profile for the username you provide)</li>
          <li>Logo.dev (company logos load from its servers, which see your IP address)</li>
          <li>Our email delivery provider (account emails)</li>
        </ul>
        <p>We may also disclose information when the law requires it.</p>
      </Section>
      <Section title="Retention and deletion">
        <p>
          We keep your data while your account exists. Delete account in your account menu permanently deletes your
          account and associated data right away and cancels any subscription. Stripe keeps payment records it is
          legally required to keep. Backups age out within our providers' retention windows.
        </p>
      </Section>
      <Section title="Your choices and rights">
        <p>
          You can update or remove your LeetCode username, change preferences, and delete your account at any time.
          Depending on where you live, you may have rights to access, correct, export or delete your data, or to object
          to certain processing. Email <Email /> and we'll respond within 30 days.
        </p>
      </Section>
      <Section title="Security">
        <p>
          Data is encrypted in transit, access to your data is restricted to your own account by the database, and
          payment details are handled only by Stripe. No system is perfectly secure, so use a strong, unique password.
        </p>
      </Section>
      <Section title="Children">
        <p>The service isn't directed to children under 13, and we don't knowingly collect their information.</p>
      </Section>
      <Section title="Changes and contact">
        <p>
          We'll post any changes here and update the date above; for material changes we'll notify you by email or in
          the app. Questions or requests: <Email />.
        </p>
      </Section>
    </>
  );
}

const TITLES: Record<LegalDoc, string> = { terms: "Terms of Service", privacy: "Privacy Policy" };

export function LegalPage({ doc }: { doc: LegalDoc }) {
  useEffect(() => {
    document.title = `${TITLES[doc]} · ${LEGAL.serviceName}`;
  }, [doc]);

  return (
    <div className="landing legal">
      <header className="landing__nav">
        <a href="/" className="legal__home" aria-label={`${LEGAL.serviceName} home`}>
          <Logo />
        </a>
        <div className="landing__nav-actions">
          <ThemeToggle />
        </div>
      </header>
      <main className="legal__body">
        <h1>{TITLES[doc]}</h1>
        <p className="legal__updated">Last updated {LEGAL.lastUpdated}</p>
        {doc === "terms" ? <Terms /> : <Privacy />}
        <p className="legal__switch">
          {doc === "terms" ? <a href="/privacy">Privacy Policy</a> : <a href="/terms">Terms of Service</a>}
          {" · "}
          <a href="/">Back to {LEGAL.serviceName}</a>
        </p>
      </main>
    </div>
  );
}
