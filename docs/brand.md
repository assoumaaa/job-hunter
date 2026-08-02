# Kestrel Brand Guideline

The visual system for the Kestrel app (frontend). One page; if a change
contradicts this file, update the file in the same commit.

Design spec: `docs/superpowers/specs/2026-08-03-kestrel-brand-design.md`
Token source of truth: `frontend/src/App.css` (`--k-*` and `--st-*` variables,
registered as Tailwind utilities via `@theme inline`). JS consumers (ag-grid,
Clerk) read the same variables through `services/theme.js` `readToken()`.

## Identity

- **Name:** Kestrel. Display surfaces only; repo stays `job-hunter`, routes and
  DB names unchanged.
- **Mark:** the crosshair (corner brackets + filled center dot). White glyph on
  a cobalt `#2563eb` rounded tile for favicon / app icon / sidebar; plain
  `currentColor` glyph elsewhere. Component: `components/BrandMark.jsx`.
- **Voice:** calm instrument. Short factual labels, no hype verbs, no em-dashes
  anywhere (use a period, comma, or hyphen), tabular numerals for data.

## Color

Semantic tokens, never raw zinc/indigo utilities in components:

| Role | Utility | Light | Dark |
|---|---|---|---|
| Page canvas | `bg-canvas` | #fafafa | #09090b |
| Card / surface | `bg-surface` | #ffffff | #18181b |
| Floating (menus) | `bg-raised` | #ffffff | #1c1c1f |
| Muted fill | `bg-muted` | #f4f4f5 | white 7% |
| Hover tint | `bg-hovertint` | ink 4% | white 5% |
| Border | `border-line` | #e4e4e7 | #27272a |
| Border strong | `border-line-strong` | #d4d4d8 | #3f3f46 |
| Text primary | `text-ink` | #18181b | #fafafa |
| Text secondary | `text-ink-2` | #52525b | #a1a1aa |
| Text tertiary | `text-ink-3` | #a1a1aa | #71717a |

**One accent: cobalt.** `bg-accent-solid` (#2563eb, both modes) for primary
buttons and the brand tile; `text-accent` / `bg-accent` (#2563eb light,
#3b82f6 dark) for icons, rings, focus; `bg-accent-soft` + `text-accent-text`
for tinted chips and selected states. Indigo and violet are retired.

**Status colors are semantic only** (never decorative): tones `neutral / ok /
warn / bad / info` via `bg-st-*` + `text-st-*-fg` utilities and
`--st-*-solid` for the jobs-grid row border. Mapping: application status
new=neutral, applied=info, interview=warn, offer=ok, rejected=bad; relevance
unscreened=neutral, good_fit=ok, maybe=warn, irrelevant=bad.

## Type

Geist (UI) + Geist Mono (data), self-hosted variable woff2 in
`frontend/public/fonts/`, preloaded in `index.html`.

Scale (utilities from `@theme`): `text-micro` 11/14, `text-label` 12.5/18,
`text-body` 13.5/20, `text-title` 16/24, `text-display` 20/28, `text-stat`
26/32. Do not add new `text-[Npx]` values. Numeric data (metrics, counts,
dates, scores) gets `font-mono tabular-nums`.

## Shape and elevation

- Radius rule: **controls 8px (`rounded-lg`), surfaces 12px (`rounded-xl`),
  pills `rounded-full`.** No other radii.
- Exactly three shadows: `shadow-raised` (cards), `shadow-overlay` (menus,
  popovers), `shadow-modal` (dialogs).

## Interaction

- Focus: `focus-visible:outline-2 focus-visible:outline-accent
  focus-visible:outline-offset-2` (or `-outline-offset-2` inside tight rows).
  Never remove an outline without a visible replacement.
- Press feedback on buttons: `active:scale-[0.98]`.
- Motion is opt-in: `motion-safe:animate-*` only; custom keyframes live behind
  `prefers-reduced-motion: no-preference` in App.css (`.pulse-dot`,
  `.animate-shimmer`).
- Every control has a programmatic name (label association or `aria-label`);
  menus, listboxes, tabs, and dialogs follow their APG patterns (see the
  primitives in `components/ui/`).

## Theme

Three-way preference (System / Light / Dark) in Settings, stored under
`kestrel.theme`, resolved to `<html data-theme>` before first paint by the
inline script in `index.html`. Components never use `dark:` variants; the
semantic tokens flip instead.

## Don't

- No em-dashes or en-dashes in UI copy.
- No new accent hues, no indigo/violet, no decorative status dots.
- No raw hex in components; add a token if one is genuinely missing.
- No `animate-*` without `motion-safe:`.
- The CV/cover-letter PDFs keep their own CMU Serif ATS system on purpose;
  the app brand does not leak into them.
