## Context

The personal site is now a single-page scroll of Swiss-styled sections (`swiss-hero`, `swiss-work`, `swiss-blog`, `swiss-footer`) rendered by `UserBlogPage` inside `.io-site` → `.io-site-content` → `.io-site-scroll` → `.io-site-section`s. See proposal.md for motivation.

Verified in code:
- `.io-site` is `height: 100%; overflow-y: auto` (a nested scroll container), while `UserBlogPage` attaches its scroll-spy to `window` — so spy never fires for inner scrolling.
- `.swiss-hero` is `min-height: 100svh; overflow: hidden` with a large amount of stacked content plus an absolutely positioned scroll cue and a marquee, which clips/overlaps on short screens.
- The `@media (max-width: 720px)` block targets `.io-work-grid`, `.io-blog-grid`, `.io-home-actions`, which no longer exist in the markup (dead rules).
- `.io-site-scroll` and `.io-site-section` have no CSS at all.

## Goals / Non-Goals

**Goals:**

- Make the personal site fit and scroll correctly at phone widths (≈360–430px) with no horizontal overflow and nothing clipped.
- Make the top nav usable on mobile (horizontal chip strip) and make the scroll-spy highlight work against the real scroll container.
- Remove dead responsive rules; add the Swiss-class equivalents.
- Keep the Swiss visual language unchanged.

**Non-Goals:**

- No changes to notebook/editor/blog-hub/admin mobile layout.
- No redesign, no routing/data/backend change.

## Decisions

**D1 — Scroll container uses `100dvh` and the spy listens to it.**
Keep `.io-site` as the scroll container but size it with `height: 100dvh` (dynamic viewport, handles mobile browser chrome) instead of `100%`, keep `overflow-y: auto`. Point the `UserBlogPage` scroll-spy at the `.io-site` element (`scroll` listener on that node) rather than `window`; compute "in view" from the element's `getBoundingClientRect()` relative to the container. Fallback to `window` if the node is absent. Alternative rejected: switching to document scroll — it requires changing the global `html/body/#root { height:100% }` chain, which risks other pages.

**D2 — Hero becomes intrinsically sized on small screens.**
Reduce the wordmark clamp minimum and add `overflow-wrap: anywhere` so long names wrap. On mobile, drop `min-height` contribution from the marquee and scroll cue: make the hero `min-height: 100svh` but allow it to grow (`height: auto`), keep `overflow: hidden` only to mask the grid, and reposition/hide the scroll cue so it does not overlap the marquee. Alternative: removing `overflow: hidden` — rejected, it would let the grid mask bleed.

**D3 — Mobile nav is a horizontally scrollable chip strip.**
At `max-width: 720px`, `.io-site-nav` becomes `flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch` with edge padding; the header keeps one row and stays `position: sticky`. Tabs keep their Swiss styling. Alternative: a hamburger drawer — more markup/state, heavier than needed for 4 items.

**D4 — Overflow guards.**
Add `overflow-x: hidden` on `.swiss-home` (and `min-width: 0` on flex/grid children that can overflow), plus `overflow-wrap: anywhere` on `.swiss-hero-wordmark`, `.swiss-work-name`, `.swiss-blog-cat-title`, `.swiss-tag`, `.io-card-title`. This prevents long unbroken strings (names, category paths) from forcing horizontal scroll.

**D5 — Fill the structural gap and delete dead rules.**
Give `.io-site-scroll` and `.io-site-section` explicit styles (block flow, full width, `scroll-margin-top` so anchored sections clear the sticky header). Replace the dead `@media (max-width: 720px)` rules with equivalent `.swiss-*` rules.

## Risks / Trade-offs

- [`100dvh` unsupported on very old browsers] → Falls back to the `100%` rule kept just above it; acceptable.
- [Horizontal chip nav can hide the active tab] → Scroll the active chip into view on state change (`scrollIntoView({ inline: 'nearest' })`).
- [Changing the spy target could regress desktop] → Keep the same rAF-throttled, passive listener and reuse the existing `updateSpy` logic with a different root.
- [Overflow guards could clip intended decoration] → Scope `overflow-x: hidden` to the site wrapper only, not global.
