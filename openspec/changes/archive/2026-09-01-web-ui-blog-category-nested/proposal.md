## Why

The category for a blog post is its **full nested column (folder) path** in the note tree. Change A stored only the immediate folder title. This change stores the complete path and renders the personal homepage as a **nested category tree** (top-level column → sub-columns → posts) with a breadcrumb on each card, per the user's "按完整栏目分类嵌套".

## What Changes

- **Backend**: `PublicFeedItem.category` = the full ancestor folder path (e.g. `技术 / Jetpack`); root notes stay uncategorized.
- **Frontend**: homepage builds a `category tree` from post paths and renders nested sections recursively, with a per-card breadcrumb and top-level pills to filter.

## Capabilities

### New Capabilities
- `web-ui-blog-category-nested`: Nested column categorization — posts carry their full column path and the homepage groups them in a nested tree with breadcrumbs.

### Modified Capabilities
<!-- None. -->

## Impact

- **Worker**: `publicFeed.ts` (full path in walk functions).
- **Front end**: `UserBlogPage` (tree grouping + breadcrumb), blog CSS.
- **Shared**: `category` already optional; unchanged shape.
