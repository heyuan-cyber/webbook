## Why

Phases 1–4 + bundle optimization landed the premium shell/typography/motion/polish. To finish the "commercial reading" feel, this increment adds an **article reading-progress bar** on blog posts — a small, high-value reading affordance.

## What Changes

- Add a fixed top **reading-progress bar** to blog post/article views that fills as the reader scrolls.
- CSS only + one small component; no new dependency; no behavior change beyond the reading indicator.

## Capabilities

### New Capabilities
- `web-ui-article-experience`: Blog-post reading affordances — a scroll-position reading progress bar.

### Modified Capabilities
<!-- None. -->

## Impact

- **Front end**: new `ReadingProgress` component + CSS; wire into `BlogPostPage` (and the editor blog-preview if trivial).
- **Dependencies**: none.
- **Systems**: no Worker/data changes.
