## Context

`web-ui-mobile-responsive` fixed the personal site, but the article page and notebook editor remain broken on phones. Live measurements at a 375px viewport (current code) confirmed:

- An article `<li>` holding the string `datatable 路径E:\M98\m98_all\_niucy_mainline\...\DT_BattleDecalTexture.uasset` had `scrollWidth 1237px` inside a 279px box — no break opportunities → the page's `scrollWidth` reached **1292px** on a **366px** viewport, cutting off body text.
- `.blog-article-layout`'s mobile rule is `grid-template-columns: 1fr`, which resolves via `minmax(auto, 1fr)` and let the column grow to **672px** (the article view's `max-width: 42rem`).
- `layout.css:3202` turns `.editor-head` into `flex-direction: column; align-items: stretch` on mobile, and `order` rules scramble it — producing a tall column of full-width buttons.

## Goals / Non-Goals

**Goals:**

- No horizontal overflow on the article page or in the notebook editor on phone widths; long unbreakable strings wrap.
- The article column always fits the viewport.
- The editor toolbar is compact and usable on mobile.
- The site header stays usable at ~320px.

**Non-Goals:**

- No redesign; no change to article/editor content semantics.
- No backend, routing, or data change.
- Not touching blog-hub/admin/circles mobile layout (out of scope for this change).

## Decisions

**D1 — Wrap long unbreakable text at the content roots.**
Add `overflow-wrap: anywhere; word-break: break-word` to the article view subtree (`.blog-article-view`, `.blog-article-view *`), the editor's block/stage text, and card titles. Verified live: an injected rule dropped page `scrollWidth` from 1292px to 366px with no leftover overflowing list items. Alternative: per-element fixes — brittle; a subtree rule covers paths, URLs, and code uniformly.

**D2 — Article column uses `minmax(0, 1fr)`.**
Change the mobile `.blog-article-layout` override to `grid-template-columns: minmax(0, 1fr)` (matching the desktop rule's guard) and cap `.blog-article-view { max-width: 100% }` on mobile. Verified live: column 672px → 310px. Alternative: leaving `1fr` and relying on D1 alone — D1 fixes the path case but a wide image/link-preview could still stretch the column.

**D3 — Editor toolbar becomes a compact scrollable row.**
Replace the mobile `.editor-head` `column/stretch` + `order` treatment with a compact layout: keep it a wrapping row with `justify-content: flex-start`, group the action buttons into a horizontally scrollable strip, and drop the `order` overrides. Minimal markup change if needed (wrap the trailing buttons in a `.editor-head-actions` container); otherwise CSS-only.

**D4 — Site header trims the brand on very narrow screens.**
At `max-width: 400px`, hide the brand name text (keep the avatar) so the tab strip has room; the tabs remain the horizontally scrollable strip from the previous change.

**D5 — Guard the notebook content area.**
Ensure the editor content area (`overflow: auto` already on `.content`) and block views cannot widen the page; add `min-width: 0` where flex children would otherwise refuse to shrink.

## Risks / Trade-offs

- [`overflow-wrap: anywhere` can break mid-word in prose] → Scope it to the article/editor subtrees only; normal prose still breaks at spaces first.
- [Hiding the brand name on narrow screens loses identity] → Only below 400px, and the avatar remains; the site title is still in the hero.
- [Existing mobile rules may conflict] → Remove the superseded `.editor-head` `order`/`column` rules rather than layering on top.
