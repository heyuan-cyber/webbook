## Context

The public feed already carries `category` (full column path). This adds a `cover` (first image) so the homepage can be image-rich. Frontend homepages + entry points reuse `UserBlogPage`, `Reveal`, motion, Phase-1 tokens, and the column tree from earlier changes (see proposal.md).

## Goals / Non-Goals

**Goals:** cover in feed; portfolio homepage (hero, Demo marquee, domain cards, tree nav, recent; motion-rich); entry points from notebook and article.
**Non-Goals:** no profile fields; no backend beyond cover; no new dependency.

## Decisions

- **Cover**: `coverFromNote(note)` walks `note.blocks`, returns the first block's `src`. `enrichFeedItem` sets it. Frontend resolves relative `src` via `assetUrl`.
- **Homepage layout**: hero (aurora/parallax) → Demo marquee (posts with covers, CSS/animation auto-scroll, hover pause) → domain cards (top-level columns; card = cover + name + count + latest 3 posts) → sticky column tree nav → recent list (thumbnails via cover). Reuses `buildCategoryTree` / `CatSection`.
- **Motion**: marquee keyframes + hover; reveal; parallax via translate on scroll; hover lift; reduced-motion disables marquee/parallax.
- **Entry**: `AppShell`/`TreeSidebar` add a "个人主页" link to `/blog/u/<self>`; `BlogPostPage` author area wraps in a Link to `/blog/u/<owner>`.

## Risks / Trade-offs

- **[Cover missing]** → gradient placeholder (`assetUrl` fail-safe).
- **[Marquee perf]** → CSS transform animation, pause on hover, reduced-motion off.
- **[No cover on private assets]** → public notes' images expected public; degrade gracefully.
