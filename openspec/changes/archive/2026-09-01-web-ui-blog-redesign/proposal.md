## Why

The blog surfaces are functional but read as "low": text-only cards, a plain header, no author presence, no motion. Blog readers expect a magazine-like hub and a **personal homepage** for each author (viewable for yourself and for others). This increment redesigns the blog hub, the personal blog homepage, and the article header with richer effects and stronger author identity.

## What Changes

- **Blog hub** (`/blog`) — gradient hero header, Bento post cards (date, accent top bar, hover lift, reveal-on-scroll), pill tabs.
- **Personal blog homepage** (`/blog/u/:userId` via `UserBlogPage`) — a profile hero (avatar, name, bio line, post count) + authored post grid; works for self and any other author. Add card links "作者主页".
- **Article header** (`BlogPostPage`) — author, date, estimated reading time; a back-to-top affordance.
- **Authors directory** on the hub (from `/api/public/bloggers`) linking to each author's homepage.
- CSS/effects shared in the blog pages.

## Capabilities

### New Capabilities
- `web-ui-blog-home`: A personal blog homepage per author (profile hero + authored posts), reachable for yourself and others, linked from the hub cards and an authors directory.

### Modified Capabilities
<!-- None new-mod; visual redesign of existing blog surfaces. -->

## Impact

- **Front end**: `BlogHubPage`, `UserBlogPage`, `BlogPostPage`, and blog CSS. Shared helpers for reading time + reveal-on-scroll.
- **Dependencies**: none.
- **Systems**: no Worker/API/data changes (uses existing `/api/public/*` feed, feed, and bloggers endpoints).
