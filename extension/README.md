# Vantage Focus (Chrome extension)

Timed, locked-down practice sessions on leetcode.com and neetcode.io.

- **Start** from the toolbar popup on a problem page: pick minutes (1–180) and a lock mode.
  - **Block AI sites** — ChatGPT, Claude, Gemini, Copilot, Perplexity, etc.
  - **Block solutions** — AI sites + YouTube + the problem's Solutions / Editorial / Discuss tabs (LeetCode) and Solution / Discuss tabs (NeetCode).
  - **Full lockdown** — everything except LeetCode, NeetCode and vantageprep.dev.
- **Give me hints** (panel on the problem page) asks where you're stuck, shows a general tip for that, then reveals the problem's *official* hints one at a time — NeetCode's own hint accordions when you're on NeetCode, otherwise LeetCode's (`question { hints topicTags }` via GraphQL). No hints → "No hints for this problem". No LLM involved.
- **I solved it** ends the session only once an accepted submission is seen (LeetCode: `recentAcSubmissionList` for your username after the session started; NeetCode: an "Accepted" result after you click Submit).
- **Give up** opens a tab with a Shakespeare passage (~1.5 min) you have to type exactly — no paste, at least 30 s — before the browser unlocks.
- **Fullscreen focus** (optional checkbox): the problem window goes fullscreen, and **Enter focus mode** on the page makes Esc press-and-hold to exit (Keyboard Lock). Switching to another tab or window, leaving Chrome (Alt+Tab to Firefox), leaving fullscreen or closing the problem tab counts as an **escape** (1.5 s grace, then re-checked) and pops up a small window with a flashing red **BAD** stop sign (1 Hz; steady glow with reduced motion) and, with the **Siren mode** checkbox (off by default), blares a siren (Web Audio wail from an offscreen document, `src/pages/siren.*`, `offscreen` permission) until the user is back. It can't be dismissed: closing it reopens it, minimizing/resizing snaps it back, clicking another Chrome window pulls it back on top, and while the user is away it's re-raised every 3 s. Only its **Back to problem** button, or returning to the problem, closes it. One escape per departure; the count is shown in the panel/popup and logged. Requires "Allow in Incognito" (manifest `incognito: spanning`) so Incognito can't dodge it. Chrome can't *stop* anyone leaving, and when the user is in another app the OS may only flash Chrome's taskbar icon until Chrome is clicked. Source: `src/background/focus.ts`, `src/pages/bad.*`.
- The timer running out unlocks too. Sessions are logged to `focus_sessions` in Supabase.

## Build and load

```bash
cd extension
npm install
npm run build        # tsc --noEmit + two vite builds → extension/dist
```

`chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`. Rebuild and hit the reload icon after changes.

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are read from the repo root's `.env.local` at build time.

## Extension ID / Google sign-in

`public/manifest.json` has a fixed `key`, so the unpacked ID is always **`gipbcakbehimohkkknkbaamjelnfnlgl`**. Google sign-in uses `chrome.identity.launchWebAuthFlow`, so in the Supabase dashboard (Authentication → URL Configuration → Redirect URLs) add:

```
https://gipbcakbehimohkkknkbaamjelnfnlgl.chromiumapp.org/**
```

Email/password sign-in works without that. (The Chrome Web Store assigns its own ID; add that one's redirect URL too when publishing.)

## How it fits together

| File | Role |
|---|---|
| `src/background/index.ts` | Service worker. Owns auth (Supabase client with `chrome.storage.local` session storage), the session state machine (`focusSession` in `chrome.storage.local`, `chrome.alarms` end timer), lock rules, hint fetching, solved verification, Supabase logging. Re-checks everything each time it wakes (`reconcile`). |
| `src/lib/lockdown.ts` | `declarativeNetRequest` dynamic rules per mode. Redirects to `pages/blocked.html` if the user granted the optional `<all_urls>` permission (popup link), otherwise plain blocks. Also a session rule that adds a leetcode.com `Referer` to the worker's GraphQL calls. |
| `src/content/` | Injected on both sites: the shadow-DOM panel (timer, hints, solved, give up), spoiler-tab hiding + SPA route bounce, NeetCode hint scraping and "Accepted" detection, and `describe` (problem slug/title) for the popup. |
| `src/popup/` | Sign in, start a session, see the running one. |
| `src/pages/abort.*` | The typing gate. The worker picks the passage and checks the typed text, so the page can't just declare success. |

Limits: disabling the extension or using Incognito gets around the lock. It's a commitment device, not a jail.
