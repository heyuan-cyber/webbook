## Context

`UserBlogPage` currently shows a simple hero + flat post grid. Change A added `PublicFeedItem.category` (tree folder title; root notes have none). This increments the homepage (see proposal.md); `web-ui-blog-home-v2` spec defines the observable behavior. Frontend-only, reuses `Reveal`, blog helpers, and Phase-1 tokens.

## Goals / Non-Goals

**Goals:** hero with stats; featured post; category-grouped sections with pills; reveal/hover effects; works for self and others.
**Non-Goals:** no backend change; no cover images (no data); no article-redesign.

## Decisions

- **Grouping**: a small `groupPostsByCategory(posts)` helper → ordered categories (by count) + a `未分类` bucket for uncategorized. Featured = first post (by `updatedAt`).
- **Pills**: a single "全部" pill + one per category; choosing filters the visible groups client-side. `AnimatePresence`-aware section transition (reuse `motion`).
- **Section heading** per category with an accent dot; card grid reuses `.blog-card`.
- **Effects**: `Reveal` on cards; hero gradient/aurora; category accent via `--accent-*` tokens.

## Risks / Trade-offs

- **[No category for root notes]** → "未分类" bucket; still visible.
- **[Many categories]** → pills wrap; sections scroll.
