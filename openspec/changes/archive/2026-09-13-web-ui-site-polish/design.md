## Context

The `web-ui-site-portfolio` change shipped a 4-tab site but exposed homepage problems. Root causes (verified in code):
- `.blog-main` has `max-width: 920px; margin: 0 auto`. `.io-site-content` reuses the `blog-main` class, so the full-screen hero is constrained to 920px and centered → wide black gutters.
- `HomeTab` intercepts `wheel`/`touch` on `window` with a manual section index and a 450ms throttle; it can only advance forward at the end and is rigid. It also keeps a `lastSectionRef` that only auto-advances on downward scroll, with no reverse.

See proposal.md for motivation. This is a frontend-only polish; no backend/deploy.

## Goals / Non-Goals

**Goals:**

- Make the homepage render full-bleed (no centered 920px gutter) while keeping work/blog/settings in their own bounded containers.
- Replace the rigid home scroll interception with a smooth, reversible CSS scroll-snap model; only auto-advance to the next tab when the reader scrolls past the last section at the bottom.
- Ensure work/blog tabs scroll normally on the page (home scroll handling fully removed on tab switch).
- Add an "进入笔记本" entry for the owner in the site header; rename the app-shell "博客" to "社区".
- Remove the note editor's featured/star control.

**Non-Goals:**

- No backend/worker change, no re-deploy, no routing change, no note-schema change.
- No change to blog-hub/feed routes or the existing `setFeaturedNote` API (kept for compatibility).
- No new external dependencies.

## Decisions

**D1 — Layout: stop inheriting `.blog-main`'s 920px for the site.**
`.io-site-content` currently uses the `blog-main` class (max-width 920px). Give the personal site its own full-width container: `.io-site-content` (and `.io-site-hero-bar`) should not be centered-constrained. The home tab renders full-bleed; work/blog/settings use their own `.io-work`, `.io-blog`, `.io-settings` inner `max-width` containers (already exist at 1200/760px). Implement by overriding width on `.io-site-content` and ensuring `.io-home`/`.io-home-slide` span full width. Alternative rejected: moving to a bespoke class on every tab — more churn; overriding the container is enough.

**D2 — Home scroll: native CSS scroll-snap.**
Replace the manual `wheel`/`touch` section index with a scroll container that uses `scroll-snap-type: y mandatory` and full-height sections with `scroll-snap-align: start`. This gives natural, smooth, reversible full-page scrolling on both desktop and mobile with no throttle. Auto-advance to the next tab is driven by a scroll listener that detects when the container has scrolled to (or past) the very bottom section and the user keeps dragging/wheeling down. Under reduced motion, snap is disabled and sections simply flow. Alternative rejected: keeping the JS interception — it was the source of the rigid/broken feel.

**D3 — Home scroll handling is scoped to the home tab.**
Because scroll-snap lives in the home component's own scroll container, when the home tab unmounts its listeners/container is gone, so work/blog are free to use normal document scroll. Verify no legacy `window.addEventListener('wheel', ...)` from HomeTab remains after the D2 rewrite (the D2 approach removes them).

**D4 — Owner entry + community label are minimal copy/UI.**
- Site header: when `isMe`, render an extra "进入笔记本" `Link` to `/app` in `.io-site-hero-bar` (alongside the tab nav).
- AppShell: change the `/blog` link text from "博客" to "社区"; route unchanged. Keep "个人主页" as-is.

**D5 — Remove featured control frontend-only.**
Delete the `★ 焦点 / ☆ 设焦点` button block in `NoteEditor.tsx`, the `featuredNoteId` state, the `loadUserPublicFeed` effect that sets it, `isFeatured`, and `toggleFeatured`. Leave `apiClient.setFeaturedNote` and the worker `/api/profile/featured` endpoint intact to avoid a re-deploy; the homepage no longer surfaces a featured spot relying on it (the home is static copy now).

## Risks / Trade-offs

- [Scroll-snap feels abrupt on some devices] → Use `scroll-snap-type: y mandatory` with `scroll-behavior: smooth`; disable under reduced motion (fall back to flowing sections).
- [Auto-advance misfires] → Only trigger when the container is at (or past) the bottom section AND a downward wheel/touch continues past a threshold; re-check on tab switch.
- [Removing featured leaves orphan backend] → Acceptable (no behavior change); the endpoint stays but is unused. If later wanted, a follow-up could remove it with a deploy.
- [Wide hero on very wide screens] → The hero content is already centered with a max inner width; the risk is only visual balance, handled by existing `clamp()` typography.
