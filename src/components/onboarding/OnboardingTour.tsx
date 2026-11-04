import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "../../styles/tour.css";

export type TourTab = "Company Questions" | "Internships";

interface OnboardingTourProps {
  active: boolean;
  // Called once the user finishes, skips or closes the tour.
  onDone: () => void;
  // Switches App's active tab; the tour walks from Company Questions into Internships.
  onShowTab: (tab: TourTab) => void;
}

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

interface TourStep {
  // data-tour="<key>" of the element to highlight; omitted = centered popover.
  key?: string;
  // The tab the element lives on. Steps on the Internships tab are resolved
  // when shown (that tab isn't rendered when the tour starts).
  tab?: TourTab;
  title: string;
  description: string;
  side?: Side;
  align?: Align;
}

// Each step highlights an element marked with data-tour="<key>". Keep those
// attributes when refactoring the components they're on (App tab bar,
// CompaniesBoard, FeaturedCompanies, LeetCodeSync, TrendingQuestions,
// JobsBoard, JobRow, AccountMenu).
const STEPS: TourStep[] = [
  {
    title: "Welcome to Vantage",
    description:
      "Prep for the exact companies you're applying to, and see every new-grad posting in one place. Here's a 30-second look around.",
  },
  {
    key: "picker",
    title: "Search any company",
    description:
      "Look up the LeetCode questions 470+ companies actually ask, filtered by when they were asked — last 30 days through all time.",
    side: "bottom",
  },
  {
    key: "featured",
    title: "Your companies",
    description:
      "Quick picks with live stats: how many questions, how many were asked this month, and the difficulty mix. Pin a company or mark it “In process” to keep it at the front.",
    side: "bottom",
  },
  {
    key: "leetcode",
    title: "Connect LeetCode",
    description:
      "Add your LeetCode username and the questions you've solved get checked off automatically, so every company shows how far along you are.",
    side: "bottom",
    align: "end",
  },
  {
    key: "trending",
    title: "Trending right now",
    description: "The questions the most companies asked in the last 30 days — a good place to start.",
    side: "top",
  },
  {
    key: "tabs",
    title: "Jobs & Internships",
    description:
      "New-grad roles and internships, merged from three public lists and refreshed every 30 minutes. Let's open Internships.",
    side: "bottom",
    align: "start",
  },
  {
    key: "job-toggles",
    tab: "Internships",
    title: "Filter what matters",
    description:
      "Search by company or title, then narrow by category, location, and one-tap filters: hide visa blockers, FAANG+ only, has salary, or new this week.",
    side: "bottom",
  },
  {
    key: "job-row",
    tab: "Internships",
    title: "Every posting at a glance",
    description:
      "Title, company, location and how recently it was posted, plus tags for salary, FAANG+ and sponsorship. Click the title to apply on the company's site.",
    side: "bottom",
  },
  {
    key: "prep",
    tab: "Internships",
    title: "Prep in one click",
    description:
      "When we have interview data for the company, the Prep chip shows how many questions they ask and jumps straight to them.",
    side: "bottom",
  },
  {
    key: "account",
    title: "Your account",
    description: "Switch light/dark theme, manage billing, or take this tour again any time.",
    side: "bottom",
    align: "end",
  },
];

const selectorFor = (key: string) => `[data-tour="${key}"]`;

// How long to wait for a tab's content to render (lists load from Supabase).
const WAIT_MS = 5000;

// Resolves when the selector matches (or after WAIT_MS, so a failed load
// doesn't strand the tour). Returns a cancel function.
function waitForElement(selector: string, onReady: () => void) {
  if (document.querySelector(selector)) {
    onReady();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (document.querySelector(selector)) finish();
  });
  const timer = window.setTimeout(finish, WAIT_MS);
  function finish() {
    observer.disconnect();
    window.clearTimeout(timer);
    onReady();
  }
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
  };
}

export function OnboardingTour({ active, onDone, onShowTab }: OnboardingTourProps) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onShowTabRef = useRef(onShowTab);
  onShowTabRef.current = onShowTab;

  useEffect(() => {
    if (!active) return;
    // Set during cleanup so destroying the tour on unmount (or StrictMode's
    // double effect) doesn't count as the user finishing it.
    let unmounting = false;
    let cancelWait = () => {};
    let tour: ReturnType<typeof driver> | null = null;

    // Switch tab, wait for `key` to render, then run `then`.
    function goToTab(tab: TourTab, key: string, then: () => void) {
      onShowTabRef.current(tab);
      cancelWait();
      cancelWait = waitForElement(selectorFor(key), then);
    }

    function buildSteps(): DriveStep[] {
      // Company Questions steps whose element isn't rendered (e.g. trending
      // failed to load) are dropped up front.
      const present = STEPS.filter(
        ({ key, tab }) => !key || tab === "Internships" || document.querySelector(selectorFor(key)),
      );
      return present.map((step, i) => {
        const { key, tab, title, description, side, align } = step;
        const popover: DriveStep["popover"] = { title, description, side, align };

        // The tab bar is the hinge between the two tabs: Next opens Internships
        // (waiting for postings to load), Back returns to Company Questions.
        if (key === "tabs") {
          if (present[i + 1]?.tab === "Internships") {
            popover.onNextClick = () => goToTab("Internships", "job-row", () => tour?.moveNext());
          }
          const prevKey = present[i - 1]?.key ?? "featured";
          popover.onPrevClick = () => goToTab("Company Questions", prevKey, () => tour?.movePrevious());
        }

        if (!key) return { popover };
        // Looked up when the step is shown, not now: switching tabs remounts
        // each board, so elements found at start would be detached on Back.
        // Fallbacks: the Prep chip only appears on rows for companies in the
        // question bank (→ first row); anything else missing → the tab bar.
        const fallbacks = tab === "Internships" ? ["job-row", "tabs"] : ["tabs"];
        const element = () =>
          [key, ...fallbacks].map((k) => document.querySelector(selectorFor(k))).find(Boolean) as Element;
        return { element, popover };
      });
    }

    cancelWait = waitForElement(selectorFor("featured"), () => {
      const steps = buildSteps();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      tour = driver({
        steps,
        animate: !reducedMotion,
        smoothScroll: !reducedMotion,
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Get started",
        popoverClass: "tour-popover",
        overlayOpacity: 0.55,
        stagePadding: 6,
        stageRadius: 10,
        onPopoverRender: (popover, { state }) => {
          // A visible "Skip" alongside Back/Next; the × still works too.
          if (state.activeIndex === steps.length - 1) return;
          const skip = document.createElement("button");
          skip.type = "button";
          skip.className = "tour-popover__skip";
          skip.textContent = "Skip tour";
          skip.addEventListener("click", () => tour?.destroy());
          popover.footer.prepend(skip);
        },
        onDestroyed: () => {
          cancelWait();
          if (!unmounting) onDoneRef.current();
        },
      });
      tour.drive();
    });

    return () => {
      unmounting = true;
      cancelWait();
      tour?.destroy();
    };
  }, [active]);

  return null;
}
