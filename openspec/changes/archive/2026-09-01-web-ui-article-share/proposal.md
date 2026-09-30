## Why

Blog posts already gained a reading-progress bar. A **share button** is the natural reading affordance to finish the article experience — let readers copy/share the current article URL with one click.

## What Changes

- Add a share button to the blog post header: uses `navigator.share` when available, otherwise copies the URL to the clipboard (with a short "已复制" confirmation).
- No new dependency; no backend change.

## Capabilities

### New Capabilities
- `web-ui-article-share`: Blog-post sharing — one-click copy/share of the article URL.

### Modified Capabilities
<!-- None. -->

## Impact

- **Front end**: `apps/web/src/pages/BlogPostPage.tsx` (share button).
- **Dependencies**: none.
- **Systems**: no Worker/data changes.
