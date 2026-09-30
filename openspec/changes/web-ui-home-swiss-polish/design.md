## Context

The Swiss homepage is implemented as a `.swiss-home` CSS scope in `apps/web/src/styles/layout.css` with component markup in `apps/web/src/pages/site/*.tsx`. Current measured values that this iteration changes:

- `--font-serif` is `'Noto Serif SC', 'Source Serif 4', Georgia, ...` and `index.html` loads only Inter, JetBrains Mono, and Noto Serif SC — so the oversized hero wordmark renders in a CJK serif, not a display serif.
- `.swiss-work-card` / `.swiss-home .io-card` use a single `1px` border, `--s-radius: 20px`, and a flat `#0a0a0a` fill.
- `.swiss-work-grid` and `.swiss-blog-grid` are both uniform `repeat(auto-fill, minmax(Npx, 1fr))`.
- `.swiss-section-head` is `flex-direction: column`.
- `.swiss-work` / `.swiss-blog` are `max-width: 1120px`; `.swiss-section` padding is `96px 24px`.
- Card hover is `translateY(-3px)` + border color; the marquee runs unconditionally; `Reveal` has no stagger.

The reference's measured language (for the decisions below): display type is Playfair Display at 192px/700; body is Inter; container is 1440px; sections use 128–192px vertical padding; the Skills grid is an explicit 12-column asymmetric bento (`md:grid-cols-12`, explicit `grid-area` spans, `min-h-[14rem]`); cards are double-framed (outer `rounded-2xl/3xl border border-white/10 p-2/p-3` + inner `rounded-xl bg-gradient-to-br from-white/[0.03]`).

## Goals / Non-Goals

**Goals:**

- Raise the site's editorial/premium quality in the three places the review found weakest: display typography, card depth, grid rhythm.
- Keep every change scoped to the personal site (`Layout`/`.swiss-home`), leaving the blog hub, editor, admin, and circles untouched.
- Keep the work data-driven: the bento must degrade correctly for 0, 1, and many cards and must not require new fields.
- Preserve all existing behavior: scroll-spy, single-scroll, owner settings, responsive rules, reduced-motion.

**Non-Goals:**

- Rewriting the hero copy or replacing the name-as-wordmark with a statement (an authoring decision for the owner).
- Rebuilding the page into a strict 12-column editorial grid with fixed `grid-area`s (the card count is dynamic and authored by the owner).
- Touching the uncommitted AI-streaming CSS that shares `layout.css`.

## Decisions

**D1 — Add the display serif as a new token, not by repointing `--font-serif`.**
Rationale: `--font-serif` is used app-wide (editor titles, blog hub, auth, admin). Repointing it would change surfaces outside this scope and would break Chinese headings if a Latin-only font won. Implementation: add `Playfair Display` (700) to the existing Google Fonts request and introduce `--s-font-display: 'Playfair Display', 'Noto Serif SC', 'Source Serif 4', Georgia, serif`, used only by the Swiss display headings. Because `Playfair Display` has no CJK glyphs, Chinese headings fall through to `Noto Serif SC` — unchanged rendering — while Latin wordmarks get the high-contrast face. Alternative rejected: swapping `--font-serif` globally (blast radius) or self-hosting a font (adds asset pipeline work for one heading style).

**D2 — Bento via a `span 2` modifier on the first card, gated by breakpoint.**
Rationale: the card count is dynamic, so the reference's fixed `grid-area` bento would break with an unknown number of cards or produce holes. A span-based bento is count-agnostic. Implementation: `WorkTab` adds `swiss-work-cell-featured` to index 0; CSS applies `grid-column: span 2` + a taller `min-height` only above a desktop breakpoint, so single-column (mobile/tablet) layouts are unaffected. With exactly one card the featured cell spans the full row (acceptable and intentional); with zero cards the empty state renders and the grid is not used. Alternative rejected: fixed 12-column areas (fragile for dynamic counts).

**D3 — Card depth drawn with a pseudo-element, no DOM restructure.**
Rationale: restructuring card markup would touch the shared `NoteCard` used by the blog hub as well. Implementation: `.swiss-work-card::before` draws an inset hairline ring with a nested radius using the nested-radius rule (`inner = outer − inset`), and the card surface gains a faint diagonal `linear-gradient` sheen. The existing `::after` gradient scrim is untouched. Alternative rejected: adding an inner wrapper element (more churn, shared-component risk).

**D4 — Section head becomes two-point on wide viewports only.**
Implementation: `@media (min-width: 768px)` switches `.swiss-section-head` to `flex-direction: row; justify-content: space-between; align-items: flex-end`, with the lede constrained by `max-width`. Below that, the current stacked column is retained so mobile reading order is unchanged.

**D5 — Stagger via an optional `delay` prop on `Reveal`.**
Rationale: `Reveal` is shared with `BlogHubPage`; the prop must be optional and default to no delay to preserve that call site. Implementation: `delay?: number` adds a CSS transition-delay (inline style), and callers pass an index-based delay capped so long lists do not accumulate an unbounded wait. Reduced-motion path stays instant.

**D6 — Interaction additions are transform/opacity only and motion-gated.**
Cover zoom uses `transform: scale()` inside the already-clipped card; the marquee pauses via `animation-play-state: paused` on hover/focus-within; both are disabled under `prefers-reduced-motion: reduce`. Only compositor-friendly properties are animated.

**D7 — Scale up container and desktop padding, keep mobile as-is.**
`1120px → 1280px` for the work/blog inner container and `96px → 128px` desktop vertical section padding, both above the existing desktop breakpoint; the mobile overrides at `max-width: 720px` are unchanged.

## Risks / Trade-offs

- [Adding a font increases page weight] → Request only the single weight used (700) and keep `display=swap`; the font is already on the existing Google Fonts origin so no new connection is needed.
- [Latin display serif mixing with CJK serif inside one heading] → Only the wordmark and short headings use the display stack; Chinese glyphs resolve to `Noto Serif SC`, so a mixed heading renders in two serif faces. Mitigation: keep the display stack to headings that are predominantly Latin (the wordmark), and verify the Chinese section headings visually.
- [Bento span can leave a hole with an odd card count] → The featured cell is first, and `auto-fill` reflows; verify with 1, 2, 3, and 5 cards.
- [Hover zoom + sticky/overflow contexts can cause repaint jank] → Animate only `transform` with a long ease, keep `will-change` off, and confirm the card's `overflow: hidden` clips the scaled image.
- [Section-head `row` layout can squeeze the title on medium widths] → Gate at `min-width: 768px` and give the lede a `max-width` so the title keeps priority.
- [Visual-only change, so typecheck is the only automated gate] → Run `npm run typecheck -w apps/web` and do a manual visual pass at desktop and mobile widths.
