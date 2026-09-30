## Why

The mobile fixes from `web-ui-mobile-responsive` covered the personal site only. Phone screenshots show the rest of the app is still broken on narrow viewports: article text is cut off on the right, the notebook editor's toolbar stacks into a jumbled column of full-width buttons, and long unbreakable strings (Windows file paths) blow out the page width. Root causes were confirmed live in a 375px viewport: a single unbreakable path made an article `<li>` 1237px wide (page scrollWidth 1292px vs a 366px viewport), and the article grid column resolved to 672px because the mobile rule used `1fr` instead of `minmax(0, 1fr)`.

## What Changes

Frontend-only responsive fixes for the article page and the notebook editor (plus a small site-nav tidy-up). No backend or data change.

- **Long unbreakable text wraps** — article content, editor canvas/stage text, and card titles get `overflow-wrap: anywhere` / `word-break: break-word`, so long paths/URLs/code no longer widen the page. (Verified live: page scrollWidth 1292px → 366px.)
- **Article column fits the viewport** — the article layout's mobile column becomes `minmax(0, 1fr)` and the article view is capped at `max-width: 100%`, so it no longer resolves to 672px on a 375px screen. (Verified live: 672px → 310px.)
- **Notebook editor toolbar is compact on mobile** — the editor head stops being a stretched vertical stack with scrambled `order`; it becomes a compact, horizontally scrollable toolbar.
- **Notebook content overflow guard** — the editor/content area gets the same wrapping/overflow guards so wide blocks cannot break the layout.
- **Site nav tidy-up** — shorten/omit the brand name on very narrow screens so the tab strip has room.

**Non-goals:** no backend/worker change, no routing/data change, no visual redesign; the article body, editor, and site keep their current look.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-ui-article-experience`: article pages must fit narrow viewports — long unbreakable content wraps and the article column never exceeds the viewport width.
- `web-ui-product-polish`: the notebook editor presents a compact, usable toolbar and no content overflow on narrow viewports.
- `web-ui-personal-site`: the site header stays usable on very narrow screens (brand trimmed, tabs reachable).

## Impact

- **Code changed (frontend only):** `apps/web/src/styles/layout.css` (article/editor/site mobile + wrapping rules); possibly `apps/web/src/components/NoteEditor.tsx` if markup grouping is needed for the toolbar.
- **Unchanged:** `workers/api/**`, `packages/shared/**`, routing, data shape.
- **No deploy needed** (frontend publishes via GitHub Pages on push). Verified with `npm run typecheck -w apps/web` and a 375px viewport pass.
