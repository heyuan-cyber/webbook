## 1. Backend cover

- [x] 1.1 Add `cover?: string` to `PublicFeedItem` (shared)
- [x] 1.2 Extract first image `src` in `enrichFeedItem` (publicFeed.ts)

## 2. Homepage v4 (portfolio)

- [x] 2.1 Animated hero (avatar/name/tagline/search + parallax)
- [x] 2.2 Demo marquee (auto-scroll cover cards, hover pause)
- [x] 2.3 Knowledge-domain cards (top-level columns with cover + count + latest)
- [x] 2.4 Sticky column tree nav + recent-posts list with thumbnails
- [x] 2.5 Rich motion (reveal/hover/marquee), reduced-motion safe

## 3. Entry points

- [x] 3.1 Notebook (AppShell) "个人主页" → own homepage; homepage returns to notebook
- [x] 3.2 BlogPostPage author area links to author homepage

## 4. Verify

- [x] 4.1 Typecheck shared + web + worker (`tsc --noEmit`)
