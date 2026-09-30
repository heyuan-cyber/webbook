## Why

The blog will focus on game-dev cases/systems, demos, CS basics, and indie-game design. The personal website homepage should read as a **visual portfolio** (images + motion), not a plain list: a hero, a Demo showcase, and knowledge-domain cards — with cover images from each note's first image.

## What Changes

- **Backend**: `PublicFeedItem.cover?` = the first image `src` found in the note's blocks (`enrichFeedItem` already loads the note).
- **Homepage (`/blog/u/:userId`)**: a portfolio homepage — animated hero (avatar/name/tagline/search), a **Demo showcase** (auto-scrolling cover-card marquee), **knowledge-domain cards** (top-level columns, each with cover + count + latest posts), a sticky column tree nav, and a recent-posts list with thumbnails.
- **Entry points**: from the notebook (topbar/sidebar) open your homepage; the article header's author area links to that author's homepage.
- Motion: parallax/aurora hero, marquee, reveal-on-scroll, hover, spring; reduced-motion respected.

## Capabilities

### New Capabilities
- `web-ui-personal-site`: A visual personal website homepage — hero, Demo showcase, and knowledge-domain cards built from columns and note covers, with a rich motion layer.

### Modified Capabilities
<!-- None. -->

## Impact

- **Worker**: `publicFeed.ts` cover extraction; shared `PublicFeedItem.cover?`.
- **Front end**: `UserBlogPage` (homepage rewrite), `AppShell`/`TreeSidebar` (homepage entry), `BlogPostPage` (author area link), blog CSS.
- **Dependencies**: none.
