## Context

Links the feed's category to the note tree's folder hierarchy. `PublicFeedItem.category` (Change A) is an optional string; this change makes it the **full path** and consumes it on the homepage as a tree (see proposal.md). Frontend-only grouping, reusing `Reveal`, motion, and Phase-1 tokens.

## Goals / Non-Goals

**Goals:** full path in the feed; nested tree grouping + breadcrumb on the homepage; top-level pills filter.
**Non-Goals:** no new endpoint; no backend beyond path composition; no cover images.

## Decisions

- **Full path composition**: during tree traversal, concatenate ancestor folder titles with ` / ` (e.g. `技术 / Jetpack`); root notes get no category.
- **`buildCategoryTree(posts)`**: split each `category` on ` / ` and insert into a nested `{ name, children, posts }` tree; uncategorized posts go to a `未分类` root node.
- **Render**: recursively render top-level → children → posts; each card shows a breadcrumb (`category`). Top-level pills filter the visible subtree. `AnimatePresence` for filter transitions.

## Risks / Trade-offs

- **[Deep nesting]** → recursion renders naturally; sections collapse on mobile by scrolling.
- **[Path separator]** → use ` / ` consistently in backend + frontend split.
