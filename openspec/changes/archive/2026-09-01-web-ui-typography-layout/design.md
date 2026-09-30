## Context

WebBook's web UI (React 18 + Vite PWA) is styled with plain CSS in `apps/web/src/styles` (`global.css` token system from Phase 1; `layout.css` component/section styles). The blog hub uses `.blog-list` (CSS grid) + `.blog-card`; the article view uses `.blog-article-view` / `.blog-a-*` classes; admin uses `.data-table` / `.strategy-card`. This increment is frontend-only and builds on the Phase 1 tokens (`--font-sans/serif/mono`, `--leading-*`, `--radius-*`, `--accent-*`). See proposal.md; the `web-ui-typography-layout` spec defines the observable behavior.

## Goals / Non-Goals

**Goals:**
- A coherent type scale in the token layer, applied consistently.
- Bento-style composed card grids on the blog hub and admin overview, with hover lift + accent border.
- A comfortable long-form reading treatment for articles.
- Polish sidebar/tree and empty-state typography.

**Non-Goals:**
- No new JS dependency or motion library (deferred to a later phase).
- No backend/Worker/data changes; no layout framework (no Tailwind/grid lib).
- No redesign of the stage/canvas editor interaction (that reads better with Phase 3 motion).

## Decisions

- **Type scale lives in the `--font-*` / `--leading-*` tokens** and a small heading-weight map (`--h1/--h2/--h3` sizes via tokens). UI stays sans, article stays serif, code stays mono. *Alternative:* per-component sizes — rejected (drift).
- **Bento cards via CSS Grid**: extend `.blog-list` to a responsive card grid with richer card content and a hover lift + accent border (`--shadow-glow`/`--accent-line`). Admin: composed `.strategy-card`/`.data-table` with clearer hierarchy. *Alternative:* JS grid — unnecessary.
- **Article rhythm via existing `.blog-a-*` classes**: tighten measure (max-width), vertical rhythm, heading spacing, figure captions, link styling; keep serif + `--leading-article`. *Alternative:* third-party MD renderer — rejected (already hand-rolled).
- **Motion remains out of scope** (Phase 3), but any transition uses `--dur-*`/`--ease` tokens.

## Risks / Trade-offs

- **[Type-scale change touches many headings]** → keep the scale modest and token-driven; verify `/app`, `/blog*`, `/admin`.
- **[Bento card density]** → keep cards readable at all breakpoints; hover only on pointer devices; respect reduced-motion for the lift transition.
- **[Long-form measure]** → don't over-narrow on mobile; cap measure on wide screens only.
- **[No motion yet]** → the "cool" factor arrives in Phase 3; this phase focuses on composition and reading.

## Open Questions

- Whether to also restyle the stage editor toolbar/summary typography here (deferred — it reads better with Phase 3 motion).
