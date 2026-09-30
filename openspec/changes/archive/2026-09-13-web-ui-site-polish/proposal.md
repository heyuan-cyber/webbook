## Why

The newly shipped multi-tab site (`web-ui-site-portfolio`) works but has interaction and layout problems on the homepage: the hero content is locked into a narrow centered column (the `.blog-main` 920px max-width is inherited, so the full-screen hero shows wide black gutters), the scroll-through home feels rigid and cannot scroll back up, the work/blog tabs do not scroll normally, there is no "enter notebook" shortcut for the owner, the top bar still says "博客" where a shared "社区" concept fits, and the note editor still shows a now-unwanted "设焦点" star control. This change polishes the shipped site into a smooth, full-width, correctly-scrolling experience and cleans up the renamed/shared navigation and the leftover featured control.

## What Changes

Fix the just-shipped `web-ui-site-portfolio` site. This is a frontend-only polish change; no backend/deploy required.

- **Full-width homepage + fix black gutters** — stop the site content from inheriting `.blog-main`'s `max-width: 920px`. The home tab should render full-bleed (hero edge-to-edge); work/blog/settings keep their own narrower inner containers.
- **Home scroll feels smooth and reversible** — replace the rigid, throttled wheel/touch interception with a natural, CSS scroll-snap scrolling model that supports scrolling both up and down through the full-screen sections, and only auto-advances to the next tab when the user scrolls past the last section at the bottom.
- **Work/blog tabs scroll normally** — ensure the home tab's scroll handling is fully removed when switching tabs, so the project/browse tabs use normal document scroll to reach all cards.
- **Owner "enter notebook" entry** — when the signed-in user is the site owner, the site header shows an "进入笔记本" entry pointing to `/app`.
- **"博客" → "社区"** — the app-shell top bar label changes from "博客" to "社区" (shared space where you can see everyone's posts) while the personal homepage remains the author's own.
- **Remove "设置焦点" control** — remove the featured/star button and its toggle logic from the note editor (frontend-only; the `setFeaturedNote` API and worker endpoint are left in place to avoid an unnecessary deploy).

**Non-goals:** no backend/worker change, no re-deploy, no change to blog-hub/feed routes, no note-schema change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-ui-personal-site`: the homepage scroll-through becomes a smooth, reversible full-screen scroll-snap experience, and the site layout renders full-width (no centered 920px gutter). The site header shows an "进入笔记本" entry when the reader is the owner.
- `web-ui-article-experience`: no change (unchanged).
- `web-ui-product-polish`: the app-shell top bar renames "博客" to "社区" to reflect a shared space, and the note editor's featured/star ("设置焦点") control is removed.

## Impact

- **Code changed (frontend only):** `apps/web/src/styles/layout.css`, `apps/web/src/pages/UserBlogPage.tsx`, `apps/web/src/pages/site/HomeTab.tsx`, `apps/web/src/components/AppShell.tsx`, `apps/web/src/components/NoteEditor.tsx`.
- **Unchanged:** `workers/api/**`, `packages/shared/**`, `apps/web/src/lib/api.ts` (the `setFeaturedNote`/`loadUserPublicFeed` APIs stay for compatibility), routing.
- **No deploy needed.** Verified with `npm run typecheck -w apps/web`.
