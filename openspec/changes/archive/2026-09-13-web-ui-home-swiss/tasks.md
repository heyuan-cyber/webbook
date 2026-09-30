## 1. Swiss visual tokens

- [x] 1.1 Add a `.swiss-home` CSS scope (and scoped `swiss-*` classes) overriding background to `#000`, text to white, accent to `#3b82f6`, thin `border-white/10` outlines, rounded-2xl/3xl cards, serif display headings, in `apps/web/src/styles/layout.css`.
- [x] 1.2 Add `@media (prefers-reduced-motion: reduce)` and mobile guards so new Swiss motion degrades gracefully.

## 2. Single-scroll homepage composition

- [x] 2.1 In `UserBlogPage.tsx`, replace the `activeTab` view-switch with a single stacked page rendering Hero → 项目示例 → 博客 → footer for full-site mode.
- [x] 2.2 Keep `SettingsTab` owner-only as a separate overlay/panel (toggle, not a scroll section).

## 3. Scroll-spy tab nav

- [x] 3.1 In `UserBlogPage.tsx`, make the top nav (首页 / 项目示例 / 博客) act as anchors: clicking scrolls to its section.
- [x] 3.2 Add scroll-spy highlighting: a passive scroll listener (rAF-throttled, motion-safe) sets the active section and highlights the matching tab, leaving 设置 outside the spy.

## 4. Restyle tabs to Swiss

- [x] 4.1 Restyle `HomeTab` to the Swiss hero (oversized serif wordmark from `name`, overline label, sub-line, marquee band, pure-black bg).
- [x] 4.2 Restyle `WorkTab` (项目示例) cards to the Swiss outlined rounded card grid.
- [x] 4.3 Restyle `BlogTab` (博客) category cards to the Swiss outlined rounded card grid.
- [x] 4.4 Remove/override old neon `io-home`/`io-work`/`io-blog` styling from the homepage so no cinematic-neon classes leak through.

## 5. Verify

- [x] 5.1 Run `npm run typecheck -w apps/web` and confirm no type errors.
- [x] 5.2 Confirm spec delta validates: `openspec validate --change web-ui-home-swiss`.
