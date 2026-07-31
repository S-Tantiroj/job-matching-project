# UI Redesign — Design Spec

Date: 2026-07-30
Status: Approved (design + mockups), pending spec review → implementation plan

## Goal

Give the whole app a cohesive, clean/minimal-SaaS look via a small central CSS
design system (tokens + reusable classes) — no new dependencies, no behavior
changes. Also add a "your shortlists" card grid to the Dashboard that links into
each shortlist.

## Approach (decided)

Global CSS + design tokens (NOT Tailwind, NOT a component library). One
`app/globals.css` defines CSS variables and ~15 reusable classes; every page and
component replaces its ad-hoc inline styles with these classes. Changing a token
restyles the whole app.

## Non-goals

- No new dependencies (no Tailwind / shadcn / CSS-in-JS lib).
- No functional/logic changes — search, ingest, auth, scoring, dedup all
  untouched. This is a visual layer only.
- No dark mode in v1 (light theme only).
- All existing Vitest tests must keep passing — component behavior/markup
  structure changes only in className/styling, not in logic or test-observable
  output. (No component currently has a snapshot test; `Timeline.test.tsx` and
  the search/ingest logic tests assert behavior, not styling.)

## Design tokens (`:root` in globals.css)

```
--bg: #f7f8fa;            /* page background */
--surface: #ffffff;      /* cards, nav, inputs */
--border: #e6e8eb;       /* hairline borders */
--border-hover: #d9dce1;
--text: #1a1d21;         /* primary text */
--text-muted: #6b7280;   /* secondary text */
--text-faint: #9299a2;   /* labels, placeholders */
--accent: #4f46e5;       /* indigo */
--accent-hover: #4338ca;
--accent-soft: #eef2ff;  /* soft accent fill */
--accent-soft-text: #4338ca;
--radius: 10px;          /* inputs, buttons */
--radius-card: 12px;
--ok: #16a34a; --warn: #d97706; --bad: #dc2626;   /* score thresholds */
--success-bg: #ecfdf5; --success-text: #047857; --success-border: #a7f3d0;
--font: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif;
```

## Reusable classes (globals.css)

Base: `body` (bg, font, color, margin 0), `h1` (20px/500), `h2` (15px/500),
`a` (accent, no underline). Then:

- `.container` — max-width 960px, centered, padding.
- `.nav`, `.nav-brand`, `.nav-link`, `.nav-link.active`, `.nav-avatar` — the top bar.
- `.card` — white surface, 1px border, 12px radius, padding.
- `.btn`, `.btn-primary` (indigo fill), `.btn-secondary` (white + border), disabled state.
- `.input`, `.textarea`, `.select` — 10px radius, border, focus ring (accent).
- `.chip` (soft indigo, icon + label), `.chip-x` (remove), `.chip-add` (dashed).
- `.pill`, `.pill-on` (green ✓), `.pill-off` (gray ○) — the coverage strip.
- `.badge-score` — rounded-square (8px), white text; color set by a modifier
  (`.badge-score--ok|--warn|--bad`) chosen from the numeric score.
- `.metric`, `.metric-label`, `.metric-value` — dashboard stat cards.
- `.list`, `.list-row` — bordered white list container + hover rows.
- `.avatar` — initials circle (accent-soft).
- `.tag` — source label (linkedin = accent-soft, else gray).
- `.section-header` — flex row: title (h2) + right-aligned action link.
- `.shortlist-card` — bookmark icon + name + "N ผู้สมัคร" + "เปิด →".
- `.result-row` — score badge + name/headline + chevron (search results).

## Files touched

Structure (create + apply):

- Create `app/globals.css` (all of the above).
- `app/layout.tsx` — import `./globals.css`; set `<html lang="th">` and metadata
  (title "Skouth"). No visual markup here beyond wiring the stylesheet.
- `app/(app)/layout.tsx` — rebuild the nav: `.nav` with brand "Skouth", links
  (Dashboard, ค้นหา, งาน, Shortlist, นำเข้า, Admin), right-aligned ตั้งค่า +
  `.nav-avatar`. Wrap children in `.container`.
- `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/page.tsx`
  (landing) — centered auth card using `.card`, `.input`, `.btn-primary`.
- `app/(app)/dashboard/page.tsx` — `.metric` grid + NEW shortlists section (see
  below) + recent-candidates `.list`.
- `app/(app)/search/page.tsx` — `.input` search bar, `.pill` coverage strip,
  editable semantic `.card`, `.chip` filters, `.result-row` results.
- `app/(app)/candidates/[id]/page.tsx` — profile header (`.avatar` + name +
  headline), skills `.chip`s, timeline, analyze panel, add-to-shortlist — all in `.card`s.
- `app/(app)/jobs/page.tsx`, `app/(app)/jobs/[id]/page.tsx` — job list `.list`,
  create form `.card`, job detail + ranked candidates `.result-row`.
- `app/(app)/shortlists/page.tsx` — create-form `.card`; each shortlist as a
  `.card` (name + its candidate `.list-row`s with a remove button) carrying an
  `id={sl.id}` anchor. (The compact `.shortlist-card` grid is the Dashboard's
  view; this page keeps the full name + candidates layout.)
- `app/(app)/import/page.tsx` — upload `.card` + `.btn-primary` + result summary.
- `app/(app)/admin/users/page.tsx`, `app/(app)/settings/page.tsx` — `.card` + form controls.
- Components: `ScoreBadge` (rounded-square, `.badge-score` + modifier),
  `FilterChips` (`.chip`/`.chip-add`), `CoverageStrip` (`.pill`),
  `JobMatches` (`.result-row` + deep-score), `CreateJobForm`/`AddToShortlist`/
  `RoleSelect`/`AnalyzePanel` (`.input`/`.btn`), `Timeline` (spacing/line only —
  keep its data logic and test intact).

## Dashboard: your-shortlists cards (the one new feature)

The Dashboard currently fetches candidate count + recent candidates via the
service-role client. Add, for the logged-in user only:

- Read the session (`getSession`) to get `userId`.
- Query: `db.from('shortlists').select('id, name, shortlist_candidates(count)').eq('owner_id', userId).order('created_at', { ascending: false })`.
  Supabase returns each shortlist with a nested `shortlist_candidates` array
  whose `[0].count` is the candidate count.
- Render a `.section-header` ("Shortlist ของคุณ" + a "สร้างใหม่" link to
  `/shortlists`) above a responsive grid of `.shortlist-card`s. The `/shortlists`
  page shows all of the user's shortlists (with their candidates) on one page —
  there is no per-shortlist detail route. So each dashboard card links to
  `/shortlists#<id>` (an in-page anchor to that specific shortlist) and shows the
  name + "N ผู้สมัคร" + "เปิด →". Empty state: a muted "ยังไม่มี shortlist" line.
- The `/shortlists` page adds `id={sl.id}` (plus `scroll-margin-top` so the
  anchor clears the nav) to each shortlist card so the `#<id>` link lands on it.

This is the only data-fetch addition; everything else is styling.

## Error handling

Pure visual work — no new failure modes. The dashboard shortlist query, if it
errors or returns none, renders the empty state (no throw). Existing per-page
data fetches and their error/empty states are preserved.

## Testing

- `npm run build` must compile (all pages/components).
- Existing `npx vitest run` suite must stay green (no logic/behavior change).
- Manual visual pass on each page: nav, dashboard (incl. shortlist cards),
  search (chips/coverage/results), candidate, jobs, shortlists, import, admin,
  settings, login/signup — confirm consistent tokens and no broken layout.

## Out of scope (later)

- Dark mode.
- Responsive/mobile refinement beyond basic flex/grid wrapping.
- Any new page or feature beyond the dashboard shortlist cards.
- Renaming the app away from "Skouth" (tentative name kept for now).

## Constraints (inherited)

- Next.js 15 App Router; server components stay server, client components stay
  client (no `'use client'` added/removed except as already present).
- Service-role client server-only; the dashboard shortlist query runs in the
  existing server component.
- No secrets, no schema/migration changes (shortlists tables already exist).
