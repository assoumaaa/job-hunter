# Kestrel Brand and Visual System, Design

Date: 2026-08-03
Status: approved direction (mockup reviewed), spec pending user review
Mockup: https://claude.ai/code/artifact/ed26d720-c1b8-4d02-b1f0-31ec9e1e71b2

## Context

The app is a Vite 6 + React 18 SPA (not Next.js; the root README is stale
create-next-app boilerplate) with Tailwind v4 via `@tailwindcss/vite`, hand-rolled
shadcn-style primitives in `frontend/src/components/ui/`, lucide-react icons,
Clerk auth, ag-grid for the jobs table, and Redux state.

Current visual state (audit 2026-08-03):

- Light-only, zinc grayscale + indigo accent, hardcoded hex in `frontend/src/App.css`
  and ad-hoc `text-[Npx]` utilities. No Tailwind `@theme`, no tokens.
- Inter is declared but never loaded (renders system fonts).
- Mixed radii (input `lg`, select `md`, card `xl`, modal `2xl`), 8+ shadow recipes,
  indigo and violet both acting as accents.
- `App.css:34-49` manually re-declares Tailwind color utilities as raw hex for
  dynamic ag-grid class strings (a second, drift-prone color source).
- Brand: name "Job Hunter" (`index.html` title, `MainMenu.jsx`), crosshair
  `BrandMark.jsx` + indigo `public/favicon.svg`. No meta description, no OG cards.
- Dead code entangled with the visuals: unrouted `pages/Login/*` custom auth UI,
  legacy `services/Auth/AuthProvider.jsx`, orphaned MUI `services/Theme/theme.js`
  (imports a package not in `package.json`), `radix-ui` dep apparently unused.

Redesign mode: Preserve. IA, routes, nav labels, form fields, and density stay.
The brand layer is created and the visual debt paid down.

## Goals

1. A named brand (Kestrel) with mark, metadata, and a written guideline.
2. A single token source of truth (Tailwind v4 `@theme` + semantic CSS variables)
   replacing hardcoded hex and ad-hoc pixel utilities.
3. Real, loaded typography (Geist + Geist Mono, self-hosted).
4. Full dark mode (system / light / dark, persisted, no flash).
5. Dead visual code removed.

## Non-goals

- No route, slug, nav-label, or form-field renames.
- CV PDF output keeps its separate CMU Serif ATS system (recruiter-facing).
- No landing/marketing page (possible later project).
- No new animation library; motion stays at hover/active/skeleton level.

## 1. Brand identity

- **Name:** Kestrel. Display surfaces only: `index.html` title, sidebar wordmark
  (sub-label "workspace" becomes "Job search"), Clerk screens, README, favicon,
  OG card, and the FastAPI title ("Kestrel API"). Repo stays `job-hunter`,
  DB user `jobhunter`, all routes unchanged.
- **Mark:** existing crosshair/corner-bracket `BrandMark.jsx`, refined: even 2px
  stroke, filled center dot r2.5 (on a 24 grid), recolored cobalt. Rendered as:
  white glyph on cobalt rounded tile (favicon, app icon, sidebar), or plain
  currentColor glyph on surfaces.
- **Voice:** calm instrument, short factual labels, tabular numerals for data.

## 2. Token system

Single source: `@theme` block in `frontend/src/App.css` mapping Tailwind color
names to semantic CSS variables; raw values set on `:root`, flipped under
`[data-theme="dark"]`. Everything (components, ag-grid, Clerk) reads the same vars.

### Palette (light / dark)

| Token | Light | Dark |
|---|---|---|
| canvas | `#fafafa` | `#09090b` |
| surface | `#ffffff` | `#18181b` |
| raised | `#ffffff` | `#1c1c1f` |
| border | `#e4e4e7` | `#27272a` |
| border-strong | `#d4d4d8` | `#3f3f46` |
| text-1 | `#18181b` | `#fafafa` |
| text-2 | `#52525b` | `#a1a1aa` |
| text-3 | `#a1a1aa` | `#71717a` |
| accent | `#2563eb` | `#3b82f6` |
| accent-soft | `#eff6ff` | `rgba(59,130,246,.14)` |
| accent-text | `#1d4ed8` | `#93c5fd` |
| hover | `rgba(24,24,27,.04)` | `rgba(250,250,250,.05)` |

Solid accent buttons: `#2563eb` background + white text in both modes
(passes AA at 5.1:1). Selection color moves from indigo to accent.

### Status colors (job state only, never decorative)

| Status | Light bg / text | Dark bg / text |
|---|---|---|
| Applied | `#f4f4f5` / `#52525b` | `rgba(250,250,250,.07)` / `#a1a1aa` |
| Screening | `#fef3c7` / `#92400e` | `rgba(217,119,6,.16)` / `#fbbf24` |
| Interview | `#dbeafe` / `#1d4ed8` | `rgba(59,130,246,.16)` / `#93c5fd` |
| Offer | `#d1fae5` / `#065f46` | `rgba(5,150,105,.16)` / `#6ee7b7` |
| Rejected | `#fee2e2` / `#b91c1c` | `rgba(220,38,38,.16)` / `#fca5a5` |

Indigo and violet retire entirely (violet's current uses map to Interview blue
or Applied zinc; decided per call-site during implementation).

### Typography

Geist (UI) + Geist Mono (numerals, dates, counts), variable woff2 vendored under
`frontend/public/fonts/`, `@font-face` with `font-display: swap`, preloaded in
`index.html`. License: SIL OFL.

Scale (tokens replace the `text-[Npx]` zoo):

| Role | Size / line | Weight |
|---|---|---|
| page-title | 20 / 28 | 600 |
| section-title | 16 / 24 | 600 |
| body | 13.5 / 20 | 400-500 |
| label | 12.5 / 18 | 400-500 |
| micro | 11 / 14 | 500 |

Numeric data (metrics, dates, counts, salaries): Geist Mono with
`font-variant-numeric: tabular-nums`.

### Shape and elevation

- Radius rule: **controls 8px, surfaces 12px, pills full.** Modal drops 2xl to 12px.
  Select trigger and dropdown both 8px.
- Exactly three shadows: `raised` (cards), `overlay` (menus, popovers), `modal`.
  Zinc-tinted light, deepened dark. All other shadow recipes removed.

## 3. Dark mode

- Three-way setting: System (default) / Light / Dark. Control lives in Settings;
  persisted in `localStorage`.
- Inline script in `index.html` resolves the stored preference (or
  `prefers-color-scheme`) and sets `data-theme` on `<html>` before first paint.
  A `matchMedia` listener follows OS changes while in System mode.
- ag-grid v35: theme built with the theming API from the same palette values,
  swapped with the mode. The manual hex utility block in `App.css:34-49` is
  replaced by classes reading CSS variables.
- Clerk: `appearance.variables` (colorPrimary, colorBackground, colorText, etc.)
  derived from the resolved mode.
- Charts/skeletons/scrollbars follow tokens.

## 4. Application scope

Token pass over every surface, preserving layout and density:

- `components/ui/*`: button, card, badge, input, select, modal, page-header,
  portal-menu, skeleton, empty-state (radius/shadow/color/type tokens; full
  focus-visible states on accent).
- Shell: `Home.jsx`, `MainMenu.jsx` (wordmark, active-nav = tinted row + accent
  icon, no indigo dot), avatar fallback to accent.
- Pages: Dashboard, Jobs (ag-grid theme), TweakJob, CvEditor + UploadZone,
  Positions, Profile, Settings (+ theme control).
- Auth: `Main.jsx` signed-out screens restyled with brand mark + themed Clerk.
- Metadata: title "Kestrel", meta description, OG/twitter card + static
  1200x630 OG image, regenerated `favicon.svg`, apple-touch-icon.

## 5. Cleanup

Delete: `pages/Login/*` (unrouted), `services/Auth/AuthProvider.jsx` (dead),
`services/Theme/theme.js` (orphaned MUI). Remove `radix-ui` dep after verifying
zero imports. Root README rewritten for the actual product (Vite SPA, FastAPI
backend, self-deploy pointer to `docs/deployment/DEPLOY.md`).

## 6. Deliverables

1. `docs/brand.md`: palette, type scale, radius/elevation rules, accent and
   status-color usage, mark usage, do/don't.
2. Applied redesign across all surfaces, both modes.
3. Updated metadata/favicon/OG, rewritten README.

## 7. Verification

- Build passes; app boots in dev and Docker single-container mode.
- Both modes visually reviewed on every route; no flash-of-wrong-theme on reload.
- Contrast spot-checks: accent text on canvas/surface, status chips, muted text
  (AA for body sizes).
- Grep gates: no `indigo-`/`violet-` utilities left outside status tokens; no
  stray `text-[Npx]` outside the scale; no `#4f46e5`.
- ag-grid renders correctly in both modes (row hover, header, selection).
