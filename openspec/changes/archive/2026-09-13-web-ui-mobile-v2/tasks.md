# Tasks

## 1. Article page fits mobile

- [x] 1.1 Add `overflow-wrap: anywhere; word-break: break-word` to the article view subtree (`.blog-article-view` and its descendants).
- [x] 1.2 Change the mobile `.blog-article-layout` to `grid-template-columns: minmax(0, 1fr)` and cap `.blog-article-view { max-width: 100% }` on mobile.

## 2. Notebook editor mobile

- [x] 2.1 Replace the mobile `.editor-head` column/stretch + `order` rules with a compact wrapping toolbar; make the action buttons a horizontally scrollable strip.
- [x] 2.2 Add wrapping/overflow guards for editor block content (long strings, canvas/stage text) and `min-width: 0` on flex children that could refuse to shrink.

## 3. Site header at very narrow widths

- [x] 3.1 At `max-width: 400px`, hide the brand name text so the tab strip has room.

## 4. Verify

- [x] 4.1 Run `npm run typecheck -w apps/web`.
- [x] 4.2 Run `openspec validate --changes web-ui-mobile-v2`.
- [x] 4.3 375px viewport pass: article page and note editor have no horizontal overflow; long paths wrap.
