# Repaint theme: warm cream/graphite (light) + warm near-black/cream (dark)

## Context

Current theme (`src/styles/tokens.css`) is a cool warm-gray light / navy dark scheme with a single amber/orange `--accent` (`#e8712b` light / `#ff8a3d` dark) used everywhere: buttons, links, focus rings, active tabs, the pipeline tracker's done/current nodes, and 3 of the 7 `PipelineStatus` badges (OA, Phone Screen, Onsite). User wants a warmer, more "receptive" look, referencing a BizLink-style UI screenshot: warm cream backgrounds, near-black/graphite as the sole UI accent (CTA buttons, active nav), and color used sparingly. Dark mode should be a true tonal inverse (warm near-black bg / warm cream accent), not the current cool-navy dark.

Per user's answers to clarifying questions:
- **Two-tier accent**: graphite/near-black becomes the *general* UI accent (buttons, links, focus rings, tabs, tracker chrome that isn't stage-specific). A **new, separate token** (`--stage-active`, a muted clay/terracotta — softened descendant of the current orange) is introduced just for the 3 "active pipeline stage" badges (OA/Phone Screen/Onsite) and the tracker's done/current nodes, so mid-funnel stages stay visually distinct from both "Not Applied" (gray) and generic black UI chrome.
- **Warm dark mode**: dark theme shifts from cool navy to a warm near-black family (same warm undertone as the new cream light theme, inverted lightness), with the accent inverting to a light cream tone on dark backgrounds (mirroring the reference's black-CTA-on-cream ↔ cream-CTA-on-black pattern).

Existing semantic colors (`--green` = Offer/positive, `--red` = Rejected/negative, `--cyan` = Applied) are kept and just re-tuned to fit the warmer, more muted palette. Third-party brand colors (Reddit `#ff4500`, Discord `#5865f2` in `MediaTracking` rules, Google logo colors in `LoginScreen.tsx`) are explicitly **out of scope** — brand-locked, not theme colors.

## New token values

All changes confined to `src/styles/tokens.css`. Two new tokens are added (`--accent-contrast`, `--stage-active` family) alongside the existing set.

**Light (`:root`):**
| Token | New value | Old value |
|---|---|---|
| `--bg` | `#f2f0e6` | `#f6f5f2` |
| `--bg-elevated` | `#ffffff` | `#ffffff` |
| `--surface` | `#ffffff` | `#ffffff` |
| `--surface-2` | `#ece9dc` | `#f0efea` |
| `--border` | `#e1ddd0` | `#e3e1da` |
| `--border-strong` | `#ccc7b5` | `#cfccc2` |
| `--text` | `#17181a` | `#1b1d22` |
| `--text-dim` | `#6b6b66` | `#62656f` |
| `--text-faint` | `#9c978a` | `#9497a0` |
| `--accent` | `#1c1d1b` (graphite) | `#e8712b` (orange) |
| `--accent-strong` | `#000000` | `#c85e1f` |
| `--accent-soft` | `rgba(28, 29, 27, 0.07)` | `rgba(232, 113, 43, 0.1)` |
| `--accent-contrast` *(new)* | `#ffffff` | — |
| `--stage-active` *(new)* | `#b5652f` (muted clay) | — |
| `--stage-active-soft` *(new)* | `rgba(181, 101, 47, 0.14)` | — |
| `--stage-active-strong` *(new)* | `#8f4e22` | — |
| `--green` | `#2f8f5b` | `#1e9e70` |
| `--red` | `#c25450` | `#dc4c4c` |
| `--cyan` | `#3e8fa0` | `#0e93a6` |
| `--backdrop` | `rgba(23, 20, 14, 0.35)` | `rgba(20, 18, 14, 0.35)` |
| `--shadow-sm` / `--shadow-md` | rebase black to warm `rgba(23, 20, 15, ...)` | cool `rgba(10, 12, 18, ...)` |

**Dark (both the `@media (prefers-color-scheme: dark)` block and `:root[data-theme="dark"]` block — keep them identical, as today):**
| Token | New value | Old value |
|---|---|---|
| `--bg` | `#14120f` | `#0b0e14` |
| `--bg-elevated` | `#1b1815` | `#11151d` |
| `--surface` | `#201d18` | `#161b25` |
| `--surface-2` | `#2a251e` | `#1d2330` |
| `--border` | `#3a342a` | `#2a3140` |
| `--border-strong` | `#4c4436` | `#3a4356` |
| `--text` | `#ede9e0` | `#e7e9ee` |
| `--text-dim` | `#a8a093` | `#9aa3b5` |
| `--text-faint` | `#6b6459` | `#5c6478` |
| `--accent` | `#f2efe6` (warm cream) | `#ff8a3d` (orange) |
| `--accent-strong` | `#ffffff` | `#ff9e5c` |
| `--accent-soft` | `rgba(242, 239, 230, 0.12)` | `rgba(255, 138, 61, 0.16)` |
| `--accent-contrast` *(new)* | `#17181a` (dark text, since accent bg is now light) | — |
| `--stage-active` *(new)* | `#e08a4e` | — |
| `--stage-active-soft` *(new)* | `rgba(224, 138, 78, 0.18)` | — |
| `--stage-active-strong` *(new)* | `#f0a264` | — |
| `--green` | `#4fae7d` | `#34d399` |
| `--red` | `#d97873` | `#f87171` |
| `--cyan` | `#6fb8c7` | `#4dd0e1` |
| `--backdrop` | `rgba(10, 9, 6, 0.6)` | `rgba(4, 5, 8, 0.55)` |

Note the `--accent-contrast` flip is required: today 3 buttons hardcode `color: #fff` on top of `background: var(--accent)`. That's safe while `--accent` is dark, but breaks once dark mode's `--accent` becomes near-white cream — white-on-cream would be invisible. `--accent-contrast` fixes this by being theme-appropriate text-on-accent color instead of a hardcoded white.

## `src/styles/global.css` edits

No component `.tsx` files need changes — `StatusBadge.tsx`, `PipelineTracker.tsx`, `RadarChart.tsx` all consume CSS classes/vars, not literal colors, so they inherit the new palette automatically. Targeted edits:

1. **`.status-badge--active`** (~line 398-401): swap `color: var(--accent)` / `background: var(--accent-soft)` → `var(--stage-active)` / `var(--stage-active-soft)`.
2. **Tracker done/current nodes** (~lines 669-671, 683-693, including the `tracker-pulse` keyframes' `box-shadow` glow): swap every `var(--accent)` / `var(--accent-soft)` reference → `var(--stage-active)` / `var(--stage-active-soft)`, so the tracker's progress glow matches the same clay tone as the active-stage badges.
3. **Three solid-accent buttons** — `.email-panel__primary-button` (~line 1130), `.suggestion-review__approve` (~line 1346), `.leetcode-card__primary-button` (~line 1641): change `color: #fff` → `color: var(--accent-contrast)`.
4. Everything else currently on `--accent`/`--accent-strong`/`--accent-soft` (focus outlines, links, active tab underline, `.tag--accent`, hover states — ~50 remaining occurrences) is left untouched; it just renders in the new graphite/cream tone automatically.
5. Leave the Reddit/Discord hardcoded brand colors (`~2244-2251`, `~2290-2297`) and `LoginScreen.tsx`'s Google logo colors untouched.

## Verification

1. `npm run dev`, open the Pipeline tab.
2. Light mode: confirm cream background, white cards, near-black buttons/links/focus rings/active tab, and that status badges read: Not Applied = gray, Applied = muted teal, OA/Phone Screen/Onsite = clay/terracotta, Offer = green, Rejected = brick red. Check the pipeline tracker's node glow matches the clay tone.
3. Toggle to dark mode (theme toggle in the UI) and confirm: warm near-black background (no blue tint), buttons/active states now render as cream-on-dark, text-on-button stays legible (this is the `--accent-contrast` fix), status badge colors read clearly against the dark surface.
4. Spot-check the RadarChart (topic profile), Jobs board `tag--accent` "FAANG+" pill, and the email-agent suggestion approve button in both themes.
5. Confirm Reddit/Discord source chips (Media Tracking) and the Google logo on the login screen are unchanged.
