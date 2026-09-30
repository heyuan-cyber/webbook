## Why

Change A gave each feed post a `category` (its tree folder). This upgrade turns the personal blog homepage into a high-end "personal site": a rich hero, a featured post, and the author's posts **grouped by category**, with filters and reveal/hover effects — so it reads like a portfolio/homepage, not a plain list.

## What Changes

- **Hero**: avatar (gradient/glow), name, bio line, stats (篇数 / 分类数), gradient/aurora backdrop, CTA (进入笔记本 / 博客广场).
- **Featured post**: the most recent public post as a large feature card.
- **Category grouping**: group posts by `category` (from Change A), each with a heading and its own Bento grid; root notes group under "未分类".
- **Category filter pills**: clicking a pill shows only that category (with a subtle transition).
- **Effects**: reveal-on-scroll, hover lift/accent, category accent colors. Works for the signed-in author and any other author.

## Capabilities

### New Capabilities
- `web-ui-blog-home-v2`: A high-end personal blog homepage — hero, featured post, category-grouped posts with filters, and reveal/hover effects.

### Modified Capabilities
<!-- None. -->

## Impact

- **Front end**: `UserBlogPage` (rebuild), blog CSS, a small `groupPostsByCategory` helper.
- **Dependencies**: none.
- **Systems**: no Worker/API changes (uses Change A's `category`).
