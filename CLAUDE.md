# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite, HMR)
npm run build     # tsc -b && vite build → dist/
npm run preview   # serve the dist/ build locally
npm run lint      # eslint . — NOT currently runnable: eslint isn't in devDependencies
```

No test suite exists.

## Environment Variables

Required in `.env.local` (gitignored):

```
VITE_GEMINI_API_KEY=
VITE_GOOGLE_CLIENT_ID=   # Gmail OAuth (GIS popup) — sync agent is disabled without it
```

No Supabase or other backend is wired up in this repo — see Architecture below.

## Architecture

React 18 + TypeScript + Vite. Styling is hand-written CSS custom properties (`src/styles/tokens.css` + `global.css`) — no Tailwind, no CSS framework. No React Router — the tab bar is local state in `App.tsx`. No global state library.

**Build scope is intentionally partial.** `plan.md` is the authoritative spec for what's in/out of scope — read it before touching layout or state shape. Only the Pipeline tab is functional; Practice/AI Coach/Resume render as disabled "Soon" tabs in `App.tsx` with no click handler and no page behind them. Don't build stub pages for them — a disabled tab is the intended state, not a placeholder to fill in.

**State is two mechanisms, deliberately not more:**
- `ThemeContext` (`src/context/ThemeContext.tsx`) — the only real cross-cutting global (light/dark, persisted to `localStorage` under `recruitlens-theme`).
- `usePipelineStore()` (`src/hooks/usePipelineStore.ts`) — a plain hook, not a Context, holding `companies`/`activeCompany`/`activeRole` in `useState`, seeded from static `src/data/mockCompanies.ts`. It's called once in `App.tsx` and prop-drilled two levels to `Sidebar` and `CompanyDetail`. There is no persistence layer — pipeline edits live only in memory and are lost on refresh. Presentational components (`PipelineTracker`, `FieldGrid`, `MaterialsSection`, `StatusBadge`, `Tag`) take data as props and must never import the store hook directly.

`src/types/pipeline.ts` defines `Company`/`Role`/`PipelineStatus`. Status values are the display strings directly (`"Phone Screen"`, `"Not Applied"`, etc.) — there's no DB enum layer to map through since there's no DB.

### Email agent (`src/lib/gmail.ts`, `gemini.ts`, `emailAgent.ts`, `src/hooks/useEmailAgent.ts`)

Ported from a sibling project (interview-os) and adapted to this repo's `PipelineStatus` shape. Read-only Gmail scan + Gemini classification, entirely client-side, no backend. **Full design doc: `emailAgentArchitecture.md`** — read that before changing anything here, it covers the sync flow, the approval queue, and a history of things already tried and reverted (model choices, rate limiting, search breadth).

The short version: `syncEmails` never mutates the pipeline directly — it fetches + batch-analyzes emails via Gemini (`analyzeRecruitingEmailsBatch`, `BATCH_SIZE = 10`, the main lever against free-tier RPM/RPD limits) and turns actionable results into `pending` suggestions in the `email_agent_log` (`localStorage`, also the dedup source). The user reviews and approves/rejects each suggestion (`SuggestionReview.tsx`) before anything touches `usePipelineStore` — `approveSuggestion`/`approveAllPending` in `useEmailAgent.ts` are the only things that ever call `EmailAgentStore`'s mutators.
