# RecruitLens — Pipeline Build Plan (React Architecture)

**Scope of this pass:** Pipeline tab only. Practice, AI Coach, and Resume are not being built yet — the shell should acknowledge they exist (so the app doesn't feel broken) but nothing beyond Pipeline needs to function. Specifics on that below.

This supersedes the Pipeline section of `RecruitLens_UI_Build_Plan.md` with more implementation detail and adds the React internals that doc didn't cover.

---

## 1. What's in scope vs. deferred

**Build now:**
- Topbar: logo + theme toggle only.
- Sidebar: search, category grouping, company rows.
- Main panel: full company detail (role switching, pipeline tracker, fields, application materials).

**Explicitly deferred — decide now so the shell doesn't half-build them:**
- The tab bar can render all four labels for visual completeness, but only "Pipeline" is clickable — Practice / AI Coach / Resume render as disabled/greyed tabs (no click handler, `aria-disabled`, maybe a "soon" label). Don't build empty placeholder pages for them; a disabled tab is honest, an empty page implies something's broken.
- The settings gear + sync-status pill + numeric stats (Problems/Active/Offers) in the topbar belong to Practice (LeetCode sync). **Omit them entirely from this pass** rather than stubbing them — there's nothing for them to configure yet, and a non-functional gear icon is worse than no gear icon.
- "Application Materials" chips still render (they're part of Pipeline), but their "Generate →" / "View →" links have nowhere to go yet since Resume doesn't exist. Point them at a no-op or a disabled state rather than a broken navigation call.

---

## 2. Folder Structure

```
src/
  types/
    pipeline.ts          # Company, Role, Status types
  data/
    mockCompanies.ts      # static seed data, shaped like the eventual DB rows
  hooks/
    usePipelineStore.ts   # owns companies state + mutations
    useTheme.ts            # theme context consumer
    useMediaQuery.ts        # breakpoint helper for the mobile drawer
  context/
    ThemeContext.tsx
  components/
    layout/
      Topbar.tsx
      ThemeToggle.tsx
    pipeline/
      Sidebar.tsx
      CompanySearch.tsx
      CompanyGroup.tsx
      CompanyRow.tsx
      CompanyDetail.tsx
      DetailHeader.tsx
      RoleSelect.tsx
      PipelineTracker.tsx
      FieldGrid.tsx
      MaterialsSection.tsx
    shared/
      StatusBadge.tsx
      Tag.tsx
      Card.tsx
      EmptyStateChip.tsx
  styles/
    tokens.css            # the CSS custom properties (color tokens), both themes
    global.css
  App.tsx
```

---

## 3. State Management

**No global state library.** At this scope (one tab, shallow tree, no cross-cutting async data yet) Redux/Zustand/Jotai would be pure overhead. Two mechanisms cover everything:

1. **`ThemeContext`** — the only thing that's genuinely global (topbar and every themed surface need it). Holds `theme: 'light' | 'dark'` and a toggle function. Persist the choice to `localStorage` and read it on mount — this is a real deployed app outside the artifact sandbox, so `localStorage` is fine and standard here (unlike in-chat mockup/artifact code, which can't use it).

2. **`usePipelineStore()`** — a custom hook, not a context, since Pipeline is currently the only consumer. Owns:
   - `companies: Company[]` (seeded from `mockCompanies.ts`, held in `useState`)
   - `activeCompanyId: string | null`
   - `activeRoleIndex: number`
   - Actions: `selectCompany(id)`, `selectRole(index)`, `togglePriority(companyId)`, `updateRoleField(companyId, roleIndex, field, value)`

   Return shape:
   ```ts
   const { companies, activeCompany, activeRole, selectCompany, selectRole, togglePriority, updateRoleField } = usePipelineStore();
   ```

   **Why a hook and not Context here:** the tree is only two levels deep (`App` → `Sidebar` + `CompanyDetail`, both direct children). Prop-drilling two levels is simpler and more traceable than a context provider for something this shallow. Promote it to Context only if a third unrelated branch of the tree needs the same state later.

   **Why this shape matters for the future:** when real persistence replaces the mock array, only the *inside* of `usePipelineStore` changes (state becomes a Supabase query + mutation instead of `useState`) — every component calling the hook keeps the exact same API. Don't let components read `mockCompanies` directly or call `setState` themselves; always go through the hook's actions.

3. **Local component state stays local.** Sidebar search text, which category groups are collapsed, and whether the mobile drawer is open all belong in `useState` inside `Sidebar.tsx` — none of it needs to be visible outside that component.

---

## 4. Types

```ts
export type PipelineStatus =
  | "Not Applied" | "Applied" | "OA" | "Phone Screen"
  | "Onsite" | "Offer" | "Rejected";

export interface Role {
  role: string;
  status: PipelineStatus;
  nextAction?: string;
  nextDate?: string;
  recruiter?: string;
  format?: string;
  notes?: string;
  style?: string;
  resumeUsed?: string;
  resumeMatch?: number;
  coverLetterUsed?: string;
}

export interface Company {
  id: string;
  name: string;
  group: string;       // category, e.g. "BIG TECH"
  tier: string;
  problems: number;
  priority: boolean;
  roles: Role[];
}
```

`furthestStatus(roles: Role[]): PipelineStatus` is a pure function, not stored state — compute it wherever the sidebar row renders, same as the mockup does.

---

## 5. Component Behavior Notes

- **`CompanyRow`** — calls `selectCompany(id)` on click. On mobile, also closes the drawer (call a `closeDrawer()` passed down or read from a small local drawer-state hook in `Sidebar`).
- **`DetailHeader`** — renders `RoleSelect` only if `activeCompany.roles.length > 1`. The header container needs `flex-wrap` so the role-select + priority-button group drops below the title on narrow widths rather than compressing — this was a real bug in the mockup (badge text wrapping mid-word) caused by missing `white-space: nowrap` on tags; carry that fix forward, don't reintroduce it.
- **`PipelineTracker`** — pure presentational component, takes `status: PipelineStatus` as a prop, computes which of the 5 stage-nodes are done/current/upcoming. No state of its own.
- **`FieldGrid`** — pure presentational, takes the `activeRole` object, renders empty-state styling (dimmed placeholder text) for any field that's `undefined`.
- **`MaterialsSection`** — same pattern as `FieldGrid`: renders a filled chip or an empty-state chip per material, driven entirely by props from `activeRole`.

None of the presentational components (`PipelineTracker`, `FieldGrid`, `MaterialsSection`, `StatusBadge`, `Tag`) should import the store hook directly — pass data down as props. Keeping them prop-driven is what makes them reusable later if Practice/Coach/Resume end up needing similar card/badge patterns.

---

## 6. Responsive Behavior (Pipeline-relevant subset)

| Breakpoint | Change |
|---|---|
| ≤980px | Field grid and materials grid collapse to one column. |
| ≤720px | Sidebar becomes a `position: fixed` overlay drawer (translateX transition) with a backdrop, toggled by a hamburger button in the topbar. Detail header stacks (title on top, role-select + priority button below, full width). Pipeline tracker scrolls horizontally instead of compressing. |
| ≤460px | Pipeline tracker stage labels hide, leaving just dots and the connecting line. |

Implement the drawer with a boolean `isDrawerOpen` state in `Sidebar` (or a tiny local layout hook) — don't put this in the pipeline store, it's pure UI state with no relevance to the data layer.

---

## 7. Non-Goals for This Pass

- No routing library — tabs are local state (`activeTab` in `App.tsx`), not URL-backed, since there's only one real destination right now. Introduce a router when a second tab is actually built.
- No real data fetching — `mockCompanies.ts` is static, imported directly.
- No auth.
- No Practice/Coach/Resume components, even as stubs — disabled tabs only, per Section 1.