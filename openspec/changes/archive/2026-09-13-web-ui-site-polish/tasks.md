# Tasks

## 1. Full-width layout

- [x] 1.1 Fix `.io-site-content` to not inherit `.blog-main`'s `max-width: 920px`; make the site top bar and home tab full-bleed.
- [x] 1.2 Confirm work/blog/settings keep their own bounded inner containers (`.io-work`, `.io-blog`, `.io-settings`).

## 2. Home scroll model

- [x] 2.1 Rewrite `HomeTab` scroll handling to use a CSS scroll-snap container (full-height sections, `scroll-snap-align`), removing the manual throttled wheel/touch section index.
- [x] 2.2 Keep the auto-advance to the next tab when the reader scrolls past the last section at the bottom (desktop + mobile), under reduced-motion guards.
- [x] 2.3 Remove the legacy `window` wheel/touch listeners so they do not leak into other tabs.

## 3. Work/blog normal scroll

- [x] 3.1 With the home scroll handling removed on tab switch, confirm work/blog tab content scrolls normally on the page.

## 4. Owner entry + community label

- [x] 4.1 Add an "进入笔记本" link to the site header (`.io-site-hero-bar`) when the reader is the site owner.
- [x] 4.2 Rename the AppShell top-bar `/blog` link text from "博客" to "社区".

## 5. Remove featured control

- [x] 5.1 Remove the "★ 焦点 / ☆ 设焦点" button in `NoteEditor.tsx`.
- [x] 5.2 Remove the associated `featuredNoteId` state, the feed-load effect that sets it, `isFeatured`, and `toggleFeatured` (leave `apiClient.setFeaturedNote` and the worker endpoint as-is).

## 6. Verify

- [x] 6.1 Run `npm run typecheck -w apps/web`.
- [x] 6.2 Run `openspec validate --changes web-ui-site-polish` and confirm the change validates.

## 7. Fix document scroll lock (方案 A)

- [x] 7.1 Make `.io-site` the site's own scroll container (`height: 100%; overflow-y: auto`) so work/blog/settings content scrolls instead of being locked to the viewport-height document.
