## Context

Blog pages (`BlogHubPage`, `UserBlogPage`, `BlogPostPage`) are plain CSS in `apps/web/src/styles/layout.css`. Feed data carries `title/summary/updatedAt/ownerEmail/visibility` (no cover image), and `/api/public/bloggers` returns author summaries. Motion helper (`lib/motion.ts`) + Phase-1 tokens exist. This is a frontend-only visual/UX redesign (see proposal.md).

## Goals / Non-Goals

**Goals:** magazine-like hub, personal homepage per author, richer article header, reveal/hover effects, authors directory. All token-driven.
**Non-Goals:** no backend/API changes; no per-post cover-image fetch (not in feed data — use gradient/initial placeholders); no comment-system changes.

## Decisions

- **Personal homepage** = richer `UserBlogPage`: a profile hero (avatar initial from email, name, "N 篇公开文章", back/进入笔记本), then a Bento card grid with date + visibility badge. Reachable at `blog/u/:userId` for any author (self or other).
- **Hub** = `BlogHubPage` enhancement: gradient hero, pill tabs, Bento cards with date + accent top bar + hover lift + reveal-on-scroll; add an authors "博主" strip from `loadBloggers()` linking `blog/u/:userId`.
- **Article header**: add author (owner email → name), formatted date, and estimated reading time (`~ceil(words/200)` from title+summary). Add a back-to-top button.
- **Effects**: a `useReveal` hook (IntersectionObserver → add `.in` class) + CSS `.reveal`/`.in` (fade-up), and CSS for `.blog-card` accent header/gradient + hover.
- **Reading time**: small helper in `lib/blog.ts` or inline.

## Risks / Trade-offs

- **[Feed lacks cover]** → decorative gradient card header + avatar initial; no data/API change.
- **[reveal on SSR-less SPA]** → IntersectionObserver; reduced-motion disables.
- **[authors strip]** → uses existing `/api/public/bloggers`.
