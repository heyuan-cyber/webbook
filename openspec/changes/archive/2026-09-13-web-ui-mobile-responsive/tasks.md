# Tasks

## 1. Scroll model

- [x] 1.1 Change `.io-site` to `height: 100dvh` (with a `height: 100%` fallback line above) keeping `overflow-y: auto`.
- [x] 1.2 Point the `UserBlogPage` scroll-spy at the `.io-site` scroll container instead of `window` (with a `window` fallback).

## 2. Hero mobile

- [x] 2.1 Make the hero wordmark scale down and wrap on narrow viewports (`clamp` min reduced + `overflow-wrap`).
- [x] 2.2 Prevent hero clipping/overlap on short screens: allow height to grow, reposition/hide the scroll cue so it does not overlap the marquee.

## 3. Mobile navigation

- [x] 3.1 Make `.io-site-nav` a horizontally scrollable chip strip at `max-width: 720px`; keep the header compact and sticky.
- [x] 3.2 Scroll the active tab into view when the active section changes.

## 4. Layout guards and structure

- [x] 4.1 Add `overflow-x: hidden` on the site wrapper and `overflow-wrap: anywhere` on wordmark/titles/tags/category text.
- [x] 4.2 Give `.io-site-scroll` and `.io-site-section` explicit styles (full-width block flow, `scroll-margin-top` for the sticky header).

## 5. Cleanup

- [x] 5.1 Remove the dead `@media (max-width: 720px)` rules targeting `.io-work-grid`/`.io-blog-grid`/`.io-home-actions`; add the equivalent `.swiss-*` mobile rules.

## 6. Verify

- [x] 6.1 Run `npm run typecheck -w apps/web`.
- [x] 6.2 Run `openspec validate --changes web-ui-mobile-responsive`.
- [x] 6.3 Mobile-viewport pass at 375px: hero not clipped, no horizontal overflow, nav scrolls, sections reachable.
