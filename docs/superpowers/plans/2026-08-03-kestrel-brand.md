# Kestrel Brand and Visual System, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Kestrel brand (spec: `docs/superpowers/specs/2026-08-03-kestrel-brand-design.md`) across the Vite/React SPA: token system, Geist type, full dark mode, accessible primitives, cleanup, and brand assets.

**Architecture:** Semantic CSS variables on `:root` flipped by `[data-theme]`, registered via Tailwind v4 `@theme inline` so utilities like `bg-surface` / `text-ink` exist. JS consumers (ag-grid, Clerk) read the same variables at runtime via `getComputedStyle`. A tiny theme service owns the three-way preference. Primitives gain label/dialog/menu/listbox semantics per APG.

**Tech Stack:** Vite 6, React 18, Tailwind v4 (`@tailwindcss/vite`), lucide-react, ag-grid v35 theming API, Clerk `appearance`, bun.

## Global Constraints

- Zero em-dashes and zero en-dashes in any user-visible string (replace with hyphen, comma, or period).
- One accent: cobalt `#2563eb` (dark accent text/fills brighten per token table). Indigo and violet utilities must not survive outside this plan's token definitions.
- Radius rule: controls `rounded-lg` (8px), surfaces `rounded-xl` (12px), pills `rounded-full`. Modal moves 2xl -> xl.
- Shadows: only `shadow-raised`, `shadow-overlay`, `shadow-modal` tokens.
- All `animate-*` usage becomes `motion-safe:animate-*`; custom keyframes gated behind `prefers-reduced-motion: no-preference`.
- Focus: `focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2` (outline, not ring, so no offset-color juggling).
- `<button>` primitives default `type="button"`.
- Package manager: `bun` (bun.lock present). Build check: `cd frontend && bun run build`.
- Routes, nav labels, form field names unchanged.

## Token table (single source, both layers)

CSS vars (App.css). Light / dark:

| var | light | dark |
|---|---|---|
| --k-canvas | #fafafa | #09090b |
| --k-surface | #ffffff | #18181b |
| --k-raised | #ffffff | #1c1c1f |
| --k-muted | #f4f4f5 | rgba(250,250,250,0.07) |
| --k-line | #e4e4e7 | #27272a |
| --k-line-strong | #d4d4d8 | #3f3f46 |
| --k-ink | #18181b | #fafafa |
| --k-ink-2 | #52525b | #a1a1aa |
| --k-ink-3 | #a1a1aa | #71717a |
| --k-accent | #2563eb | #3b82f6 |
| --k-accent-solid | #2563eb | #2563eb (buttons, both modes) |
| --k-accent-solid-hover | #1d4ed8 | #1d4ed8 |
| --k-accent-soft | #eff6ff | rgba(59,130,246,0.14) |
| --k-accent-text | #1d4ed8 | #93c5fd |
| --k-hover | rgba(24,24,27,0.04) | rgba(250,250,250,0.05) |
| --k-toast-bg | rgba(24,24,27,0.95) | #1c1c1f |
| --k-toast-fg | #fafafa | #fafafa |

Status pairs (`--st-<name>-bg` / `--st-<name>-fg`, plus `--st-<name>-solid` for the grid row border):

| name | light bg/fg | dark bg/fg | solid light/dark |
|---|---|---|---|
| neutral | #f4f4f5 / #52525b | rgba(250,250,250,0.07) / #a1a1aa | #e4e4e7 / #3f3f46 |
| ok | #d1fae5 / #065f46 | rgba(5,150,105,0.16) / #6ee7b7 | #10b981 / #10b981 |
| warn | #fef3c7 / #92400e | rgba(217,119,6,0.16) / #fbbf24 | #f59e0b / #f59e0b |
| bad | #fee2e2 / #b91c1c | rgba(220,38,38,0.16) / #fca5a5 | #ef4444 / #ef4444 |
| info | #dbeafe / #1d4ed8 | rgba(59,130,246,0.16) / #93c5fd | #3b82f6 / #3b82f6 |

Status mapping decision (refines the spec table against the app's real enums):
applicationStatus: new=neutral, applied=info, interview=warn, offer=ok, rejected=bad.
relevanceStatus: unscreened=neutral, good_fit=ok, maybe=warn, irrelevant=bad.
DocChip ready + BulletRow conditional + CV active tab + agent "Optimizing": accent-soft/accent-text.

Shadows: raised `0 1px 2px rgba(24,24,27,0.05)` (dark `0 1px 2px rgba(0,0,0,0.4)`), overlay `0 4px 16px rgba(24,24,27,0.10)` (dark `0 4px 16px rgba(0,0,0,0.5)`), modal `0 16px 48px rgba(24,24,27,0.16)` (dark `0 16px 48px rgba(0,0,0,0.6)`).

Type tokens (@theme): `--text-micro: 11px/14px`, `--text-label: 12.5px/18px`, `--text-body: 13.5px/20px`, `--text-title: 16px/24px`, `--text-display: 20px/28px`, `--text-stat: 26px/32px`. Page passes replace `text-[Npx]` with the nearest token (10.5-11.5 -> micro, 12-12.5 -> label, 13-14 -> body, 15-16 -> title, 20-22 -> display, 26 -> stat).

Fonts: `--font-sans: "Geist", system-ui, ...`, `--font-mono: "Geist Mono", ui-monospace, ...`; `@font-face` from `/fonts/geist.woff2` + `/fonts/geist-mono.woff2` (variable, `font-weight: 100 900`, `font-display: swap`).

### Task 1: Token foundation

**Files:** rewrite `frontend/src/App.css`; modify `frontend/index.html`; add `frontend/public/fonts/geist.woff2`, `geist-mono.woff2` (already downloaded in session scratchpad).

- [ ] App.css: `@import "tailwindcss"` + `@theme inline` registering `--color-canvas/surface/raised/muted/line/line-strong/ink/ink-2/ink-3/accent/accent-solid/accent-solid-hover/accent-soft/accent-text/hover` -> the `--k-*` vars, the five `--st-*` color pairs, `--shadow-raised/overlay/modal`, text tokens, font stacks.
- [ ] `:root { color-scheme: light; ... }` light values; `:root[data-theme="dark"] { color-scheme: dark; ... }` dark values.
- [ ] Base layer: body bg canvas / color ink / font sans; selection = accent-soft; scrollbar thumbs from line/line-strong vars; delete the manual ag-grid hex utility block entirely.
- [ ] Keyframes pulse/shimmer wrapped in `@media (prefers-reduced-motion: no-preference)`; `.animate-shimmer` uses muted/canvas vars; add `.pulse-dot` class (replaces inline `style={{animation}}` usages).
- [ ] index.html: title "Kestrel", meta description, og:/twitter tags (image `/og.png`), theme-color for both schemes, favicon + apple-touch-icon links, font preloads, inline pre-paint theme script (localStorage `kestrel.theme`, fallback system), drop the inline Inter style block.
- [ ] Verify: `bun run build` passes. Commit `feat(theme): Kestrel token foundation, Geist fonts, dark-mode bootstrap`.

### Task 2: Theme service + feedback surfaces

**Files:** create `frontend/src/services/theme.js`; modify `Snackbar.jsx`, `FullPageProgress.jsx`, `src/services/index.js`.

**Produces:** `useTheme() -> { pref, resolved, setPref }` (pref: "system"|"light"|"dark"; resolved: "light"|"dark"), `readToken(name) -> string`.

- [ ] theme.js: storage key `kestrel.theme`; `setPref` writes storage + sets `document.documentElement.dataset.theme`; `useTheme` subscribes to `matchMedia("(prefers-color-scheme: dark)")` while pref=system; `readToken(name)` = getComputedStyle on documentElement.
- [ ] Snackbar: tokens (toast-bg/fg), `role="status"` (`role="alert"` when variant="error"), icons aria-hidden.
- [ ] FullPageProgress: canvas/accent tokens, `role="status"` + `aria-label="Loading"`.
- [ ] Build + commit `feat(theme): theme service, accessible toasts and loader`.

### Task 3: Primitives (tokens + APG semantics)

**Files:** modify all of `frontend/src/components/ui/*.jsx`.

- [ ] button: default `type="button"`, focus outline standard, variants on tokens (primary = accent-solid/white, hover accent-solid-hover), `active:scale-[0.98]`.
- [ ] input/textarea: optional `label`/`hint`/`error`/`id` props (useId fallback); label above control via `<label htmlFor>`; `aria-invalid` + `aria-describedby` when error; tokens.
- [ ] select: listbox pattern. Trigger `aria-haspopup="listbox"` + `aria-expanded` + optional `label`/`ariaLabel`; popup `role="listbox"` with `aria-activedescendant`, options `role="option"` + `aria-selected`; ArrowUp/Down/Home/End move, Enter/Space select, Esc/Tab close, focus returns to trigger; opening with keyboard focuses the list.
- [ ] modal: portal to body; `role="dialog" aria-modal="true" aria-labelledby`; focus panel on open, restore trigger focus on close; `#root` gets `inert` while open; `overscroll-contain`; close button `aria-label="Close"`; `rounded-xl shadow-modal`.
- [ ] portal-menu: `role="menu"` container; focuses first `[role="menuitem"]` on open; ArrowUp/Down/Home/End roving focus (querySelectorAll), Esc closes + returns focus to trigger; `shadow-overlay` token.
- [ ] badge: tones neutral/muted/ok/warn/bad/info/accent on `--st-*`/accent tokens; violet tone deleted; `dot` prop retained but decorative call sites stop passing it.
- [ ] card / page-header / skeleton / empty-state: token + radius + shadow pass; skeleton `motion-safe:animate-pulse`.
- [ ] Build + commit `feat(ui): accessible primitives on Kestrel tokens`.

### Task 4: Shell and auth

**Files:** `Home.jsx`, `MainMenu.jsx`, `Main.jsx`, `Logout.jsx` (visual only).

- [ ] Home: skip link (`sr-only focus:not-sr-only`) -> `<main id="main">`; bg canvas.
- [ ] MainMenu: wordmark "Kestrel" + sublabel "Job search"; accent brand tile; active nav = muted bg + accent icon, indigo dot removed; avatar fallback accent; collapse/expand + sign-out buttons get aria-labels; `aria-current` comes free from NavLink.
- [ ] Main.jsx: signed-out screens get brand lockup above Clerk card; Clerk `appearance.variables` derived from `useTheme().resolved` via `readToken` (colorPrimary, colorBackground, colorText, colorInputBackground, colorInputText, borderRadius "8px").
- [ ] Build + commit `feat(shell): Kestrel shell, nav, themed auth`.

### Task 5: Dashboard + Jobs + TweakJob

**Files:** `Dashboard/*.jsx`, `Jobs/*.jsx`.

- [ ] Dashboard: token pass; tab strip -> `role="tablist"/"tab"` + `aria-selected` + roving tabindex + arrow keys, panel `role="tabpanel"`; greeting "Hey {name}." (em-dash removed); "Avg ATS" placeholder "-"; MetricCard label styling kept, value `text-stat font-mono`.
- [ ] DashboardWidgets: ProgressRing strokes from `readToken`/currentColor (accent + muted); ActionButton pulse -> `.pulse-dot motion-safe` class; Applied/Interview badges ok/warn, no dot; indigo hovers -> accent.
- [ ] Jobs: grid theme built in `useMemo` keyed on `resolved` theme reading `readToken` values (background, foreground, header, row border, hover, selected row, checkbox accent, font "Geist"); `RELEVANCE_META` hex -> `var(--st-*-solid)` (works in inline getRowStyle); filter Inputs get `aria-label="Filter by company"/"Filter by job title"`; view Select `ariaLabel="Filter jobs by status"`; FetchDropdown items `role="menuitem"` + trigger aria; pencil/date/doc cells get aria-labels; screening result snackbar "N good, N maybe, N no" (middot ration); "screened — " prefix -> "screened, ".
- [ ] StatusChip: trigger `aria-haspopup="menu"` + `aria-expanded` + `aria-label` ("Change fit"/"Change status" via new `menuLabel` prop); options `role="menuitem"`; colorMap moves to `--st-*` classes.
- [ ] TweakJob: tabs -> tablist pattern; transcript `role="log" aria-live="polite"`; user bubble accent-solid; prompt Textarea `aria-label="Editing instruction"`; token pass; pulse dots gated.
- [ ] Build + commit `feat(pages): dashboard, jobs, tweak on tokens with keyboard support`.

### Task 6: CV + Positions + Profile + Settings

**Files:** `CV/*.jsx`, `Positions/Positions.jsx`, `Profile/Profile.jsx`, `Settings/Settings.jsx`.

- [ ] CV.jsx: section tabs -> tablist + tabpanel wrapper; violet actives -> accent; Save announces via sr-only `role="status"` ("Saving"/"Saved"); modal title "CV preview".
- [ ] FormWidgets: `Field` associates via useId `<label htmlFor>`; AutoTextarea accepts `id`; ListItem remove button `aria-label={"Remove " + (label || "item")}` + hit-area `after:absolute after:-inset-2`; TagEditor remove buttons `aria-label={"Remove " + tag}` + input `aria-label`; Section (non-bare) collapse button `aria-expanded`.
- [ ] ExperienceSection/BulletRow: "Bullets" label -> group with `role="group" aria-label="Bullets"`; IconBtn takes `label` -> `aria-label`; condition editor label htmlFor its AutoTextarea id; violet condition panel -> accent-soft; period placeholder "Jan 2022 - Present".
- [ ] UploadZone: rebuild native-first: `<label>` wraps visually-hidden focusable `<input type="file" accept=".pdf" className="sr-only">`; drop handlers stay on wrapper; focus-visible outline on the zone via `has-[:focus-visible]:outline-2`; indigo -> accent.
- [ ] Positions: pills `aria-pressed` (job types, suggested adds are plain buttons); remove buttons aria-labels; country `<select>` gets `aria-label="Add country"`; keyword input label + placeholder "Press Enter to add"; keyword chips accent-soft.
- [ ] Profile: Row renders `<label htmlFor>` (Row gains `htmlFor` prop; inputs get ids); seniority + notice pill sets -> `role="radiogroup"` with `role="radio"`/`aria-checked` + arrow keys (shared small helper in Profile); language remove aria-labels; language-level picker radiogroup.
- [ ] Settings: KeyField label association; new "Appearance" card: three-way theme control (`role="radiogroup"`, System/Light/Dark) wired to `useTheme`; subtitle em-dash removed; model Selects get labels via Row htmlFor equivalents (`ariaLabel`).
- [ ] Build + commit `feat(pages): cv, positions, profile, settings on tokens with labeled controls`.

### Task 7: Cleanup

**Files:** delete `src/pages/Login/`, `src/services/Auth/`, `src/services/Theme/`; modify `src/pages/index.js`, `src/services/index.js`, `package.json`; rewrite root `README.md`.

- [ ] Grep first: no live imports of Login/Auth/Theme barrels; prune barrel exports; delete dirs.
- [ ] Grep `radix-ui` and `class-variance-authority` imports; if zero, remove both from package.json; `bun install`.
- [ ] README.md: actual product (Kestrel, Vite SPA + FastAPI, self-deploy pointer to docs/deployment/DEPLOY.md).
- [ ] Build + commit `chore(frontend): remove dead auth, MUI theme, unused deps; real README`.

### Task 8: Brand assets + backend title + brand.md

**Files:** rewrite `frontend/public/favicon.svg`; add `frontend/public/apple-touch-icon.png`, `frontend/public/og.png`; modify `backend/app/main.py` (title only); create `docs/brand.md`.

- [ ] favicon.svg: 32-grid cobalt (#2563eb) rounded square, white crosshair glyph (BrandMark geometry).
- [ ] Raster assets: render SVG -> PNG via `qlmanage -t -s`, fallback Python Pillow, fallback: ship SVG only and note it. og.png 1200x630: cobalt tile + "Kestrel" + "Job search workspace" (system font acceptable in raster).
- [ ] backend/app/main.py: FastAPI title -> "Kestrel API".
- [ ] docs/brand.md: token tables, radius/elevation/type rules, accent + status usage, mark usage, do/don't (no em-dashes, one accent, no decorative dots).
- [ ] Commit `feat(brand): Kestrel assets, metadata, brand guideline`.

### Task 9: Verification gates

- [ ] `bun run build` clean.
- [ ] Grep gates: `grep -rnE "indigo-|violet-" frontend/src` -> only token definitions (expect zero in JSX); `grep -rn "#4f46e5" frontend/src` -> zero; `grep -rnE "—|–" frontend/src` -> zero in user-visible strings; `grep -rn "animate-" frontend/src` -> all motion-safe or CSS-gated; `grep -rn "text-\[" frontend/src` -> only stat/edge cases with justification.
- [ ] Dev server smoke: `bun run web` + HTTP 200 on `/`.
- [ ] Honest report of what needs human eyes: both-theme visual review per route, axe pass, VoiceOver spot-check, grid keyboard traversal.

## Self-review notes

- Spec coverage: identity (T4/T8), tokens (T1), type (T1), dark (T1/T2/T4/T5), a11y remediation (T3-T6), cleanup (T7), deliverables brand.md/README/OG (T7/T8), verification (T9). Interview/applied status-color mapping deviation from spec table documented above with rationale (the app has a real "new" status the spec table lacked).
- Types: `useTheme`/`readToken` defined T2, consumed T4/T5/T6. Badge tones renamed (success->ok etc.) must be updated at every call site in T5/T6 (AtsScoreCell, DashboardWidgets, agentTag map).
- No placeholders: mappings are exact; code-level detail lives in the primitives' APG contracts above and executes against files already read in-session.
