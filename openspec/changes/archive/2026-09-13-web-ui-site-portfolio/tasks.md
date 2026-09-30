# Tasks

## 1. Backend: site config model + endpoints

- [x] 1.1 Extend `workers/api/src/userProfile.ts`: add a `SiteConfig` interface (`workNoteIds`, `blogNoteIds`, `blogCategoryOrder`) and add optional `site?: SiteConfig` to `UserProfile`.
- [x] 1.2 Add `GET /api/public/users/:id/site` to `workers/api/src/index.ts` — public read of the site config (no auth).
- [x] 1.3 Add `PUT /api/profile/site` to `workers/api/src/index.ts` — owner-only write (verify token, write to own profile via `saveUserProfile`).
- [x] 1.4 Include `site` in the `GET /api/public/users/:id/feed` response.

## 2. Frontend: api client

- [x] 2.1 Add `loadSiteConfig(userId)` (public read) and `saveSiteConfig(config, token)` (owner write) to `apps/web/src/lib/api.ts`.
- [x] 2.2 Add a `SiteConfig` type in `apps/web` (or shared) mirroring the worker shape.

## 3. Frontend: tabbed site shell

- [x] 3.1 Re-architect `UserBlogPage.tsx` into a tab container with `activeTab` state (`'home' | 'work' | 'blog' | 'settings'`) and a fixed top nav (首页/项目示例/博客/设置), rendering the matching tab component without URL change.
- [x] 3.2 Show the 设置 tab only when the signed-in user is the site owner (default to `'home'`).

## 4. Frontend: Home tab

- [x] 4.1 Build `HomeTab`: full-viewport cinematic hero (overline pill, two-line serif display heading with italic/gradient second line, subtitle) over a fixed gradient + grain background.
- [x] 4.2 Add a game-themed mouse-interactive decoration (cursor-following particle/constellation canvas), motion-safe and capped, pausing when the tab is hidden.
- [x] 4.3 Implement scroll-through sections (wheel/touch, throttled) and at the content end advance `activeTab` to `'work'` (desktop + mobile), under reduced-motion guards.

## 5. Frontend: Work tab

- [x] 5.1 Build `WorkTab`: a "selected works" header + a scrollable bento/grid of large cards from `site.workNoteIds`, each with cover, title, summary, `View Project →`, tag/spine row, and a metric label.
- [x] 5.2 Show a placeholder when the work region is unconfigured or empty.

## 6. Frontend: Blog tab

- [x] 6.1 Build `BlogTab`: category-grouped list of note cards (cover/title/summary/date) from `site.blogNoteIds`, grouped by note `category` (default) or by `site.blogCategoryOrder` when configured.
- [x] 6.2 Show a placeholder when the blog region is unconfigured or empty.

## 7. Frontend: Settings tab

- [x] 7.1 Build `SettingsTab` (owner-only): assign notes to the work and blog regions (from the author's public notes) and set blog category order; save via `apiClient.saveSiteConfig`.

## 8. Frontend: Article TOC

- [x] 8.1 Add a right-side `ArticleToc` to `BlogPostPage` built from heading blocks (level 1/2/3), rendering indented entries.
- [x] 8.2 Wire click-to-scroll navigation and active-section highlight from a throttled scroll listener; collapse to an accessible toggle on mobile.

## 9. Styles

- [x] 9.1 Add CSS for the tab shell/nav, home immersive hero + interaction decor, work bento cards, blog category cards, settings panel, and article TOC.
- [x] 9.2 Add `@media (prefers-reduced-motion: reduce)` guards and mobile breakpoints.

## 10. Verify

- [x] 10.1 Run `npm run typecheck -w apps/web` and `npm run typecheck -w workers/api`.
- [x] 10.2 Run `openspec validate --changes web-ui-site-portfolio` and confirm the change validates.
