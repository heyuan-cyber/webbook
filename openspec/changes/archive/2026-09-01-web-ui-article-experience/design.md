## Context

Blog posts render in `BlogPostPage` (React, `react-router`). The article lives inside `<main className="blog-main blog-article">`. This increment only adds a reading indicator (see proposal.md); `web-ui-article-experience` spec defines the observable progress behavior.

## Goals / Non-Goals

**Goals:**
- A fixed top progress bar on blog posts that tracks vertical scroll through the article.
- Token-driven styling (accent), subtle, reduced-motion-safe (no continuous animation).

**Non-Goals:**
- No change to article content/layout; no backend; no new dependency.

## Decisions

- **`ReadingProgress` component** with a `RefObject` target: listens to `scroll`/`resize`, computes `-rect.top / (offsetHeight - innerHeight)` clamped 0–1, renders a fixed bar scaled by `scaleX`. *Alternative:* IntersectionObserver — heavier for this simple case.
- **Positioning**: `position: fixed; top: 0; left: 0; right: 0; height: 3px; transform-origin: left;` accent gradient, above content (`z` below the command palette/backdrop but above the page).

## Risks / Trade-offs

- **[Scroll listener churn]** → `passive: true`, minimal work per event; acceptable for one page.
- **[Very short article]** → bar clamps to full; no layout impact.
