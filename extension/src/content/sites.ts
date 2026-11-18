import type { Hint, Platform, ProblemInfo } from "../lib/types";

export function currentPlatform(): Platform | null {
  if (location.hostname.endsWith("leetcode.com")) return "leetcode";
  if (location.hostname.endsWith("neetcode.io")) return "neetcode";
  return null;
}

export function problemSlug(): string | null {
  return location.pathname.match(/^\/problems\/([^/?#]+)/)?.[1] ?? null;
}

function cleanTitle(raw: string): string {
  return raw.replace(/\s*[-|]\s*(LeetCode|NeetCode).*$/i, "").trim();
}

/** LeetCode's slug rule: "Pow(x, n)" -> "powx-n", "Two Sum" -> "two-sum". */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

/**
 * The LeetCode slug for a NeetCode page. NeetCode's URL slug differs
 * ("two-integer-sum") and it doesn't link to LeetCode, but its page title is
 * the LeetCode title ("Two Sum - NeetCode", meta description "Leetcode 1. Two
 * Sum …"), so slugify that.
 */
function neetcodeLeetCodeSlug(title: string): string | null {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href*="leetcode.com/problems/"]')) {
    const m = a.href.match(/leetcode\.com\/problems\/([^/?#]+)/);
    if (m) return m[1];
  }
  return title ? slugify(title) : null;
}

export function describeProblem(): ProblemInfo | null {
  const platform = currentPlatform();
  const slug = problemSlug();
  if (!platform || !slug) return null;
  const heading = document.querySelector("h1")?.textContent?.trim();
  const title = (cleanTitle(document.title) || heading || slug).replace(/^\d+\.\s*/, "");
  const url = platform === "leetcode" ? `https://leetcode.com/problems/${slug}/description/` : `https://neetcode.io/problems/${slug}/question`;
  return {
    platform,
    slug,
    leetcodeSlug: platform === "leetcode" ? slug : neetcodeLeetCodeSlug(title),
    title,
    url,
  };
}

/**
 * NeetCode puts its hints in collapsible <details> blocks ("Hint 1",
 * "Recommended Time & Space Complexity"). Read them straight off the page.
 */
export function scrapePageHints(): Hint[] {
  if (currentPlatform() !== "neetcode") return [];
  const hints: Hint[] = [];
  for (const d of document.querySelectorAll("details")) {
    const summary = d.querySelector("summary");
    const label = summary?.textContent?.trim() ?? "";
    const kind = /complexity/i.test(label) ? "complexity" : /hint/i.test(label) ? "hint" : null;
    if (!kind) continue;
    const clone = d.cloneNode(true) as HTMLElement;
    clone.querySelector("summary")?.remove();
    const html = clone.innerHTML.trim();
    if (html) hints.push({ kind, html: kind === "complexity" ? `<b>${label}</b><br>${html}` : html });
  }
  return hints;
}

// Tabs and buttons that lead to answers. Matched on exact visible text, and
// only on small clickable elements, so normal content never matches.
const SPOILER_TEXT = new Set(["Solutions", "Solution", "Editorial", "Discuss", "Video Solution", "Solution Video"]);
const CLICKABLE = 'a, button, [role="tab"], .flexlayout__tab_button, [class*="tab"]';

export function hideSpoilers(): void {
  for (const el of document.querySelectorAll<HTMLElement>(CLICKABLE)) {
    if (el.dataset.vfHidden) continue;
    const text = el.innerText?.trim();
    if (!text || text.length > 20 || !SPOILER_TEXT.has(text)) continue;
    el.dataset.vfHidden = el.style.display || "-";
    el.style.setProperty("display", "none", "important");
  }
}

export function restoreSpoilers(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-vf-hidden]")) {
    const prev = el.dataset.vfHidden;
    el.style.removeProperty("display");
    if (prev && prev !== "-") el.style.display = prev;
    delete el.dataset.vfHidden;
  }
}

/** Both sites switch to spoiler tabs without a page load; bounce back. */
export function bounceFromSpoilerRoute(): void {
  const platform = currentPlatform();
  if (platform === "leetcode") {
    const m = location.pathname.match(/^\/problems\/([^/]+)\/(solutions|editorial|discuss)/);
    if (m) location.replace(`/problems/${m[1]}/description/`);
  } else if (platform === "neetcode") {
    const m = location.pathname.match(/^\/problems\/([^/]+)\/(solution|discuss)/);
    if (m) location.replace(`/problems/${m[1]}/question`);
  }
}
