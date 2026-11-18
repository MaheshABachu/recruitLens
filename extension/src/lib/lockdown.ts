import type { Mode } from "./types";

type Rule = chrome.declarativeNetRequest.Rule;
const { RuleActionType, ResourceType, HeaderOperation } = chrome.declarativeNetRequest;

export const AI_DOMAINS = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "claude.ai",
  "gemini.google.com",
  "bard.google.com",
  "aistudio.google.com",
  "notebooklm.google.com",
  "copilot.microsoft.com",
  "copilot.cloud.microsoft",
  "perplexity.ai",
  "poe.com",
  "deepseek.com",
  "chat.deepseek.com",
  "phind.com",
  "you.com",
  "meta.ai",
  "grok.com",
  "x.ai",
  "mistral.ai",
  "chat.mistral.ai",
  "huggingface.co",
  "character.ai",
  "pi.ai",
  "blackbox.ai",
  "codeium.com",
  "kimi.com",
  "kimi.moonshot.cn",
  "qwen.ai",
  "chat.qwen.ai",
  "t3.chat",
  "lmarena.ai",
  "openrouter.ai",
];

const VIDEO_DOMAINS = ["youtube.com", "youtu.be", "m.youtube.com"];

/** Reachable in full lockdown (subdomains included). */
export const FULL_ALLOW = ["leetcode.com", "neetcode.io", "vantageprep.dev"];

// Dynamic rule ids owned by a session. Session rule 1 is the LeetCode
// Referer rule (installReferer), which is always on.
const SESSION_RULE_IDS = [101, 102, 103, 104, 105];

/**
 * Builds the rules for a lock mode. With the optional <all_urls> permission
 * we redirect to our "blocked" page; without it Chrome only lets us block, so
 * the user sees Chrome's own "blocked by an extension" page.
 */
export function buildRules(mode: Mode, friendly: boolean): Rule[] {
  const blockedPage = chrome.runtime.getURL("pages/blocked.html");
  const blockOrRedirect = (reason: string): Rule["action"] =>
    friendly
      ? { type: RuleActionType.REDIRECT, redirect: { regexSubstitution: `${blockedPage}?reason=${reason}&u=\\0` } }
      : { type: RuleActionType.BLOCK };
  const anyUrl = friendly ? { regexFilter: "^https?://.*" } : {};

  const rules: Rule[] = [
    {
      id: 101,
      priority: 1,
      action: blockOrRedirect("ai"),
      condition: { ...anyUrl, requestDomains: AI_DOMAINS, resourceTypes: [ResourceType.MAIN_FRAME] },
    },
  ];

  if (mode === "solutions" || mode === "full") {
    // Full page loads of a problem's spoiler tabs bounce back to the
    // description. (Tab switches inside LeetCode's SPA are handled by the
    // content script.)
    rules.push({
      id: 102,
      priority: 3,
      action: {
        type: RuleActionType.REDIRECT,
        redirect: { regexSubstitution: "https://leetcode.com/problems/\\1/description/" },
      },
      condition: {
        regexFilter: "^https://leetcode\\.com/problems/([^/?#]+)/(solutions|editorial|discuss)",
        resourceTypes: [ResourceType.MAIN_FRAME],
      },
    });
    rules.push({
      id: 105,
      priority: 3,
      action: {
        type: RuleActionType.REDIRECT,
        redirect: { regexSubstitution: "https://neetcode.io/problems/\\1/question" },
      },
      condition: {
        regexFilter: "^https://neetcode\\.io/problems/([^/?#]+)/(solution|discuss)",
        resourceTypes: [ResourceType.MAIN_FRAME],
      },
    });
    rules.push({
      id: 103,
      priority: 1,
      action: blockOrRedirect("solutions"),
      condition: { ...anyUrl, requestDomains: VIDEO_DOMAINS, resourceTypes: [ResourceType.MAIN_FRAME] },
    });
  }

  if (mode === "full") {
    rules.push({
      id: 104,
      priority: 1,
      action: blockOrRedirect("full"),
      condition: {
        regexFilter: "^https?://.*",
        excludedRequestDomains: FULL_ALLOW,
        resourceTypes: [ResourceType.MAIN_FRAME],
      },
    });
  }
  return rules;
}

export async function applyLockdown(mode: Mode): Promise<void> {
  const friendly = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: SESSION_RULE_IDS,
    addRules: buildRules(mode, friendly),
  });
}

export async function clearLockdown(): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id) });
}

/**
 * LeetCode's GraphQL endpoint wants a leetcode.com Referer, which fetch() from
 * a service worker can't set. A session rule adds it to requests that come
 * from no tab (i.e. this extension's worker).
 */
export async function installReferer(): Promise<void> {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            { header: "Referer", operation: HeaderOperation.SET, value: "https://leetcode.com/" },
            { header: "Origin", operation: HeaderOperation.SET, value: "https://leetcode.com" },
          ],
        },
        condition: {
          urlFilter: "||leetcode.com/graphql",
          tabIds: [chrome.tabs.TAB_ID_NONE],
          resourceTypes: [ResourceType.XMLHTTPREQUEST, ResourceType.OTHER],
        },
      },
    ],
  });
}
