## Context

The personal homepage (`apps/web/src/pages/UserBlogPage.tsx`) is currently a tabbed view: `activeTab` state chooses one of `HomeTab` / `WorkTab` / `BlogTab` / `SettingsTab` to render. Each tab has its own scrollable container; `HomeTab` already implements a scroll-snap immersive hero. All content data (`workNoteIds` → `workPosts`, `blogNoteIds` → `blogPosts`/`blogGroups`, `name`, `site`) is already computed in `UserBlogPage` before rendering.

The reference (Pitch Black Swiss) is a single long-scroll page with a top nav whose items are in-page scroll anchors + scroll-spy. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**

- Convert the homepage into one continuously scrolling page: Hero → 项目示例 → 博客 → footer.
- Keep the top nav looking like tabs, but make them scroll-spy anchors: click → smooth-scroll to section; scroll → highlight active section.
- Restyle to the Swiss visual language: `#000` background, white text, single blue accent (`#3b82f6`), serif display headings, `Inter`-style body, `border-white/10` outlines, rounded-2xl/3xl cards, restrained motion.
- Reuse existing feed data only; keep the owner-only 设置 as a separate route/panel.
- Keep `embedded` mode functional and motion-safe; degrade on mobile.

**Non-Goals:**

- No About/Stats/Process/Skills hardcoded blocks.
- No new note fields, no API, no Worker change, no deploy.
- No change to `SettingsTab`, article/blog-hub/feed pages, or `packages/shared`.

## Decisions

**D1 — Merge Work/Blog into the scroll; `activeTab` becomes scroll-spy, not view-switching.**
`UserBlogPage` keeps a single rendered page with sections; `activeTab` is replaced by a `activeSection` derived from scroll position (IntersectionObserver or a scroll listener) used only to highlight the nav. The old `activeTab === 'work'` / `'blog'` conditional rendering is removed so all sections render stacked. Alternative rejected: keep tab switching and just restyle — does not satisfy the single-scroll requirement.

**D2 — Owner settings stays a separate panel, not a section.**
`SettingsTab` is rendered only when the owner clicks a 设置 entry (toggle a `showSettings` boolean or a `/settings` hash), and it overlays/replaces the scroll content rather than being an in-page anchor. This keeps owner-only config out of the public single-scroll flow. Alternative rejected: making settings a scroll section — wrong for a public page and conflicts with owner-only visibility.

**D3 — Swiss tokens as new CSS, layered on top of existing vars, not a palette swap of global tokens.**
The Swiss look needs `#000` bg + single `#3b82f6` accent + serif display type. Rather than repaint the existing `--accent` (gold) tokens (used across the app), add a `.swiss` scope (or scoped classes) that overrides background/color/accent/border within the personal site only, so the rest of the app (blog hub, editor, admin) is unaffected. Alternative rejected: swapping global `--accent`/`--bg` — would repaint unrelated surfaces.

**D4 — Hero wordmark from `name`, no new data.**
The oversized serif wordmark uses the already-derived `name` (from `ownerEmail`). Overline label and sub-line use existing site copy/summary. No new field.

**D5 — Motion is safe and low-key.**
Reuse `useMotionSafe()` (`@/lib/motion`) and the existing `Reveal` component. Marquee reuse is kept. Scroll-spy uses a passive scroll listener + rAF, gated by `prefers-reduced-motion`. Desktop parallax (if any) is media-query gated; mobile falls back to static.

## Risks / Trade-offs

- [Scroll-spy listener may thrash] → single passive listener + rAF throttle, only attached when not reduced-motion.
- [Reusing existing card CSS may clash with new Swiss card styles] → scope new Swiss classes under `swiss-*` and remove/override the old `io-*` on the homepage only; keep `io-*` for any surface still using it.
- [Embedded mode semantics] → single-scroll applies in full-site mode; embedded keeps a content-only rendering (still single-scroll sections but without the site top-bar scroll-spy). If this proves wrong, scope down to full-site only.
- [Visual-only, typecheck is the gate] → `npm run typecheck -w apps/web`.

## Migration Plan

Frontend-only. No deploy, no data migration. Rollback = revert the homepage components + CSS changes.
