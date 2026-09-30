## Context

WebBook web front end is React 18 + TypeScript + Vite PWA, styled with plain CSS in `apps/web/src/styles` (`global.css`, `layout.css`) using CSS custom properties that already exist (surface/text/accent/radius/shadow/font). The current look is a warm-dark "quiet reading" theme. Components are ad-hoc class-based (`btn btn-ghost`, shell/topbar/sidebar in `AppShell.tsx`, `TreeSidebar.tsx`). See proposal.md for the motivation; specs (`web-ui-visual-language`) define the observable behavior. This increment is purely the visual/design-token foundation — no backend or data changes.

## Goals / Non-Goals

**Goals:**
- A complete, reachable design-token system (colors, surfaces, typography, spacing, radius, shadow, z-index, motion) usable by the whole app.
- Materiality: glass/backdrop-blur chrome, accent glow/state, subtle aurora/grain.
- Accessibility: `:focus-visible` ring, WCAG AA contrast, `prefers-reduced-motion` fallback.
- Convert the app shell and shared CSS to tokens; no hardcoded literals in changed files.

**Non-Goals:**
- No new JS dependency (Framer Motion / GSAP / animation) — deferred to a later phase.
- No component-library rewrite (shadcn/Tailwind) — deferred.
- No light theme in this increment (possible later).
- No backend/Worker/API/data changes; no PWA/manifest changes.

## Decisions

- **Tokens live in `:root` in `global.css`, grouped by intent** (color/surface/text/accent-ramp/spacing/radius/shadow/elevation/z-index/typography/motion). Rationale: it's already the token home; keeps a single source and easy theming. *Alternative considered:* Tailwind + shadcn — rejected as too large a refactor for this increment.
- **Glass via `backdrop-filter: blur` + translucent surface + 1px border + inset highlight**, applied only to primary chrome (topbar, sidebar, floating panels/popovers), with a solid fallback. Rationale: glass is the highest-impact "premium" cue. *Alternative:* full-page glass — rejected (performance + legibility). *Fallback:* where `backdrop-filter` is unsupported/costly, use a slightly opaque surface.
- **Aurora + grain as `position:fixed` pseudo-element/decoration layers** at very low opacity, `pointer-events:none`, behind content, with a no-animate static state and a `prefers-reduced-motion` off switch. Rationale: adds atmosphere without touching layout.
- **Accent glow via `box-shadow`/ring using `--accent-*` tokens** on active/focus/hover/selected; a shared ring for `:focus-visible`. Rationale: consistent, token-driven.
- **Contrast is a constraint, not a taste check** — keep text at AA on every surface; the glass scrim stays dark enough to preserve readability.
- **Intensity is tunable by feedback.** After the first review the effect read as "too subtle" against the app's prior warm-dark chrome. The materiality tokens (aurora alpha, glass translucency/blur, accent-glow, grain) were raised so the atmosphere is perceptible; all are token-driven so they can be dialed back to a more restrained read without changing structure.

## Risks / Trade-offs

- **[`backdrop-filter` cost on low-end/mobile]** → apply only to chrome, keep blur radius modest, provide an opaque fallback; verify at runtime.
- **[Glass reduces legibility over busy content]** → dark translucent scrim + visible border; run a contrast check against the underlying surface.
- **[Aurora overdone feels gimmicky]** → very low opacity, tunable via a token, disabled under reduced-motion.
- **[Token migration touches many files]** → confine this increment to shell + shared CSS and the visual-language spec'd surfaces; avoid a total sweep.

## Open Questions

- Include a light theme in a later phase (deferred — does not change this change's specs/approach/tasks).
- Exact aurora hue intensity is a visual-taste param (tunable via token, no spec change).
