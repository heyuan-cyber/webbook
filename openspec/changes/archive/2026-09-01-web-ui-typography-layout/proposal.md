## Why

Phase 1 (`web-ui-premium-shell`) established the token + materiality foundation. To reach "大气 / 正式 / 成熟商业化", this increment refines **typography hierarchy and page composition**: a coherent type scale, Bento-style card grids on the blog hub and admin, and a more comfortable long-form reading experience. This is where the "looks like a real product" feeling lands, and it builds entirely on Phase 1's tokens.

## What Changes

- **Type scale**: define heading sizes/weights/letter-spacing, UI sans vs article serif, code mono, and caption/dim text in the token layer; apply consistently across headings, body, blockquote, code.
- **Composed card grids (Bento)**: turn the blog hub's post list and the admin overview into composed card grids with clear hierarchy, hover lift and accent border.
- **Long-form reading**: refine the article view (measure, spacing, headings, figures/captions, links, task checkboxes) for a comfortable, editorial read.
- **Sidebar/tree + empty-state typography** polish.
- No backend/API changes; no new dependency (motion/animation is a later phase).

## Capabilities

### New Capabilities
- `web-ui-typography-layout`: The WebBook typographic and page-composition language — a consistent type hierarchy, Bento-style card grids, and a polished long-form reading experience.

### Modified Capabilities
<!-- None: this is a new visual-composition capability. -->

## Impact

- **Front end**: `apps/web/src/styles/global.css`, `apps/web/src/styles/layout.css`; components `BlogHubPage` (post grid), `AdminPanel` (overview), article view (`BlogPostPage` / `BlogArticleView`), sidebar/tree.
- **Dependencies**: none added.
- **Systems**: no Worker/API/data changes; PWA build unchanged.
