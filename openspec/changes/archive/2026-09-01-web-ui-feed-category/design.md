## Context

`PublicFeedItem` (shared) is built in `workers/api/src/publicFeed.ts` by walking the user's public tree; the walker discards folder structure. The note tree uses `TreeNode` with `kind: 'note' | 'folder'` and `children`. This change only adds a category field (see proposal.md).

## Goals / Non-Goals

**Goals:** carry each post's source folder title as `category`; keep root notes uncategorized.
**Non-Goals:** no new endpoint; no tag-based category; no UI redesign (badge only).

## Decisions

- **Category = the immediate containing folder title.** During traversal, pass the current folder title down to note children; notes at root get no `category`. *Alternative:* top-level folder only / full path — rejected (the immediate folder is the natural "category"; a full path is noisy).
- **Backward compatible**: `category` is optional; older clients ignore it.

## Risks / Trade-offs

- **[Nested folders]** → use the direct parent folder's title; fine for grouping.
- **[Folder renamed]** → category follows the current tree, so it's live.
