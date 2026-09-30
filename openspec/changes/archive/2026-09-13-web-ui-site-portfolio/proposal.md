## Why

The personal homepage is currently a single-page portfolio (`/blog/u/:userId`) that stacks an immersive hero, a demo marquee, discipline sections, and a gallery into one long scroll. The user wants it to read as a **multi-tab portfolio website** — the kind of premium "creative technologist" site shown to others — with a persistent top navigation that switches the content area, and a Settings tab where only the owner decides which notes fill each region. This gives the site a mature, commercial, showcase-first structure instead of a blog index.

## What Changes

This change re-architects the personal homepage into a **state-driven multi-tab site** (no route change per tab) and adds **persistent per-user site configuration** so the owner curates content.

- **Tabbed site shell** — the homepage gets a fixed top nav with tabs: 首页 (home, default), 项目示例 (work), 博客 (blog), and 设置 (settings). Tabs are switched by state (`activeTab`), not by URL; the settings tab is visible and reachable only when the signed-in user is the site owner.
- **首页 (Home, default)** — an immersive cinematic intro (reference: `Where code becomes sensation.`): overline pill, huge two-line serif heading (second line italic + gradient), a subtitle, and game-related mouse-interactive elements (e.g. cursor-following particle constellation). It is **static copy** (overview of the site's domains) plus optional interactive decoration. Wheel/touch scrolling pages through full-viewport sections; when the user reaches the content end and keeps scrolling, it **auto-switches to the 项目示例 tab** (on both desktop and mobile).
- **项目示例 (Work)** — a portfolio showcase (reference: `Proof before pitch. Work that speaks first.`): a "selected works" heading, then a scrollable bento/grid of large cards each driven by a note (cover image, title, short description, `View Project` link, and tag/spine + a metric label). Cards come from the notes assigned to the work region in site config.
- **博客 (Blog)** — a blog feed grouped by note category (used-by-default), rendering cards with cover, title, summary, and date. Grouping uses the note's `category` by default, with an optional custom ordering from site config.
- **Settings (owner only)** — a panel where the owner assigns which notes go into each region (work list, blog list, blog category order). The config is persisted per user.
- **Article TOC** — article pages gain a right-side table of contents built from heading blocks (level 1/2/3) that scrolls to each section and highlights the current one as you read.
- **Placeholders** — before the owner has configured anything, each tab shows a sensible placeholder instead of breaking.

**Non-goals:** no per-tab route URLs, no change to article/blog-hub/feed pages beyond adding the TOC, no new note fields (the site config is separate metadata, not note schema), no changes to Auth.

## Capabilities

### New Capabilities

- `web-ui-site-config`: per-user site configuration that maps notes into the homepage regions (work list, blog list, blog category order). It is readable by any visitor of the site and writable only by the site owner. Stored in the user profile data.

### Modified Capabilities

- `web-ui-personal-site`: the homepage is restructured from a single long scroll into a state-driven multi-tab site (首页 / 项目示例 / 博客 / 设置) with a fixed top nav and owner-gated settings. The hero becomes an immersive cinematic intro with mouse-interactive game-themed effects and scroll-through sections that auto-advance to the next tab at the content end; the work section becomes a scrollable bento of note-driven portfolio cards; the blog is grouped by note category.
- `web-ui-article-experience`: article pages gain a persistent right-side table of contents generated from heading blocks (level 1/2/3), with click-to-scroll navigation and active-section highlight.

## Impact

- **Code changed:** `apps/web/src/pages/UserBlogPage.tsx` (re-architect into a tab container + tab components), new tab components (home/work/blog/settings), `apps/web/src/pages/BlogPostPage.tsx` (TOC), `apps/web/src/lib/api.ts` (site config methods), `apps/web/src/styles/*.css` (new tab-site + immersive + bento + TOC styles).
- **Backend changed:** `workers/api/src/userProfile.ts` (extend profile with `site` config), `workers/api/src/index.ts` (add `GET/PUT /api/profile/site`, expose site config on the user feed), `packages/shared` (add site-config types if shared owns them).
- **Needs a Worker deploy** to serve the new site-config endpoint. Verified with `npm run typecheck -w apps/web` and `npm run typecheck -w workers/api`.
- **Unchanged:** note schema, article/hub/feed read routes, Auth, asset pipeline.
