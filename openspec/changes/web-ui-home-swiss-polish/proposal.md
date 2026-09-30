## Why

The Swiss homepage shipped in `web-ui-home-swiss`, but an art review against the reference (`portfolio-pitch-black-swiss.vercel.app`, measured via its computed styles and DOM) shows the visual hierarchy is still flat: the hero's oversized wordmark renders in a CJK serif rather than a high-contrast display serif, cards are a single flat layer, both grids are uniform, and section heads are single-column stacks. The goal is a premium editorial feel, and the gap is concentrated in typography, card depth, and grid rhythm — not in color (our accent already matches the reference exactly at `#3b82f6`).

## What Changes

This is a **presentation-only** iteration. It reuses the existing feed data and changes no data, API, or Worker code.

- **Display typography** — load a high-contrast display serif (Playfair Display) and apply it to the site's display headings (hero wordmark, section H2, footer headline) with the existing CJK serif kept as the fallback for Chinese glyphs, so Chinese headings do not regress.
- **Card depth** — give the work/blog cards a nested frame: an inner hairline ring inset from the outer border with a nested (smaller) radius, plus a faint diagonal sheen on the card surface. Single DOM node, drawn with a pseudo-element.
- **Bento rhythm** — let the first work card span two columns and grow taller on desktop, so the work grid gains a focal card instead of reading as a uniform tiling.
- **Two-point section heads** — on wide viewports, lay the section head out as title-left / lede-right aligned to the baseline (`row` + `space-between` + `align-items: flex-end`) instead of a stacked column.
- **Interaction polish** — cover images scale up on card hover (eased, clipped by the card), the marquee pauses on hover, and card reveals stagger by index instead of firing simultaneously.
- **Scale** — widen the work/blog inner container and increase desktop section padding, so the page reads as a gallery rather than a 1120px reading column.
- **Pitch-black discipline** — reduce the hero's blue radial glow so the black stays dominant, keeping blue for functional accents (CTA, links, index numbers) only.

**Non-goals:** no change to the hero copy or the name-as-wordmark content (that is an authoring decision, not a styling one); no About/Stats/Process/Skills blocks; no data-model, API, routing, scroll-spy, or responsive-behavior changes; no changes to the blog hub, editor, admin, or circles.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change is presentation-only: no requirement's observable behavior changes (the bento card grid, marquee hover behavior, and full-width hero are already specified in `web-ui-personal-site`). Per the schema's rule against inventing requirements to satisfy validation, this change sets `skip_specs: true` in its `.openspec.yaml`.

## Impact

- **Code changed:** `apps/web/index.html` (add the display serif to the Google Fonts request), `apps/web/src/styles/layout.css` (the `.swiss-*` block: display font token, card frame, bento span, section-head layout, hover/reveal effects, container and padding scale, hero glow), `apps/web/src/pages/site/WorkTab.tsx` (mark the first card as the featured cell), `apps/web/src/pages/site/BlogTab.tsx` and `WorkTab.tsx` (stagger delay by index), `apps/web/src/components/Reveal.tsx` (optional `delay` prop).
- **Unchanged:** `packages/shared`, `workers/api`, `apps/web/src/lib/api.ts`, routing, scroll-spy, `HomeTab` copy, `SettingsTab`.
- **Frontend only.** Verified with `npm run typecheck -w apps/web`. No Worker deploy needed.
