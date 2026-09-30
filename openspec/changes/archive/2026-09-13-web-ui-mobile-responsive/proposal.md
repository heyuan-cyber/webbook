## Why

The personal site (Swiss redesign) is not usable on phones: the page is locked inside a fixed-height inner scroll container (`html`/`body`/`#root`/`.io-site` were all `height: 100%`), so mobile scrolling and the scroll-spy nav behave badly; the full-viewport hero clips its content on short screens; the top nav (brand + up to four spaced tabs) overflows/crowds; and the mobile media queries target classes (`.io-work-grid`, `.io-blog-grid`, `.io-home-actions`) that no longer exist after the Swiss rewrite, so they do nothing. This change makes the personal site properly responsive.

## What Changes

Frontend-only responsive fixes for the personal site (`.swiss-home` / `.io-site`). No backend or data change.

- **Scroll model fixed**: the site keeps its own scroll container but sized with `100dvh` (not `100%`), and the scroll-spy/nav highlighting listens to that container's scroll instead of `window`, so tab highlighting works and mobile scrolling is native.
- **Hero responsive**: the oversized wordmark scales down and wraps instead of clipping; the hero no longer hides content on short viewports; the scroll cue no longer overlaps the marquee band on small screens.
- **Top nav responsive**: on narrow screens the tab row becomes a horizontally scrollable chip strip (no wrapping into a tall stack), and the header stays compact.
- **Layout guards**: add `overflow-x` guards and text wrapping so long titles/category tags can't blow out the viewport; give the previously-unstyled `.io-site-scroll` / `.io-site-section` explicit styles.
- **Cleanup**: remove/repair the dead `@media (max-width: 720px)` rules that target removed classes, and add the corresponding Swiss-class mobile rules.

**Non-goals**: no change to the notebook/editor/blog-hub/admin pages (this change covers the personal site); no routing, backend, or data-shape change; no visual redesign — same Swiss look, just responsive.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-ui-personal-site`: the personal site becomes responsive — full-viewport hero that does not clip on small screens, a horizontal-scroll chip nav on narrow viewports, a working scroll-spy against the site's own scroll container, and layout/overflow guards.

## Impact

- **Code changed (frontend only):** `apps/web/src/styles/layout.css` (site + Swiss responsive rules), `apps/web/src/pages/UserBlogPage.tsx` (scroll-spy target), `apps/web/src/pages/site/HomeTab.tsx` (hero markup if needed for wrap/overlap).
- **Unchanged:** `workers/api/**`, `packages/shared/**`, routing, data shape.
- **No deploy needed.** Verified with `npm run typecheck -w apps/web` and a mobile-viewport pass.
