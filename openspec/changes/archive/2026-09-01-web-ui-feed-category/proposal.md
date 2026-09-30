## Why

To display blog posts **by category**, the public feed must carry each note's source category (its tree folder). Today `PublicFeedItem` loses folder hierarchy during tree traversal, so the frontend can't group by category.

## What Changes

- Add `category?: string` to `PublicFeedItem` (shared type).
- In `workers/api/src/publicFeed.ts`, carry the note's containing folder title as `category` during traversal (root-level notes stay uncategorized).
- Frontend: show a category badge on blog cards (foundation for Change B grouping).

## Capabilities

### New Capabilities
- `web-ui-feed-category`: Public feed items carry the post's source category (tree folder) so clients can group posts by category.

### Modified Capabilities
<!-- None. -->

## Impact

- **Shared**: `PublicFeedItem.category` (optional).
- **Worker**: `publicFeed.ts` traversal.
- **Front end**: blog card badge.
- No new endpoint; PWA build unchanged.
