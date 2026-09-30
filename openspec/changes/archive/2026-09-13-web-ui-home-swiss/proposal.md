## Why

The personal homepage (`UserBlogPage.tsx`) currently renders as an immersive cinematic-neon scroll-snap hero plus tab-switched `work`/`blog` views. The owner wants the homepage to read like a premium single-page portfolio in the **Pitch Black Swiss** style (reference: `portfolio-pitch-black-swiss.vercel.app`) — a pure-black, editorial-typography landing page with scroll-spy tab navigation. The current cinematic/neon direction (`web-ui-home-immersive`, 0/10) goes the opposite way and is being abandoned in favor of this Swiss-direction change.

## What Changes

This change restyles the personal homepage and re-wires its navigation — **visual/layout only**, reusing the already-present `cover` / `category` / `featuredNoteId` / `workNoteIds` / `blogNoteIds` data. No new note fields, no API, no Worker change.

- **Single-page scroll** — the homepage becomes one continuously scrolling page (Hero → 项目示例 → 博客 → footer), mirroring the reference site's vertical flow.
- **Scroll-spy tab nav** — the top nav keeps the *look* of tabs (首页 / 项目示例 / 博客). Clicking a tab smooth-scrolls to its section; scrolling highlights the active section (scroll-spy). The owner-only **设置** stays as a separate route/panel, not a scroll section.
- **Pitch-Black-Swiss visual language** — pure-black `#000` background, white text, a single blue accent (`#3b82f6`), large serif display headings, `Inter`-style body, thin `border-white/10` outlines, rounded-2xl/3xl cards, restrained motion.
- **Hero** — oversized serif wordmark (author name), small overline label, sub-line, and a marquee band; replaces the neon particle hero.
- **项目示例 (Work)** — existing `workNoteIds` bento/grid restyled to the Swiss card look.
- **博客 (Blog)** — existing `blogNoteIds` category cards restyled to the Swiss card grid.
- **Abandon `web-ui-home-immersive`** — that change no longer represents the desired direction and is left inactive.

**Non-goals:** no About/Stats/Process/Skills hardcoded blocks (the four reference blocks are intentionally dropped, not stubbed); no engine/platform tags; no play/repo links; no new note fields; no changes to article / blog-hub / feed pages; no data-model change; no deploy.

## Capabilities

### New Capabilities

None. This is a restyle + navigation rework of an existing capability.

### Modified Capabilities

- `web-ui-personal-site`: the homepage is restyled from the cinematic-neon tabbed layout into a single-scroll, scroll-spy page using the Pitch-Black-Swiss visual language (pure black + single blue accent + serif display type + thin outlined rounded cards), with the four reference hardcoded blocks intentionally **not** built. Behavior data (`cover` / `category` / `featuredNoteId` / `workNoteIds` / `blogNoteIds`) and entry points are unchanged; only presentation and in-page navigation change.

## Impact

- **Code changed:** `apps/web/src/pages/UserBlogPage.tsx` (single-scroll composition, scroll-spy nav, section wiring), the four `apps/web/src/pages/site/*.tsx` tab components (visual restyle of `HomeTab`/`WorkTab`/`BlogTab`; `SettingsTab` untouched), and `apps/web/src/styles/layout.css` (new Swiss classes + motion-safe/mobile guards).
- **Unchanged:** `packages/shared` (no model change), `workers/api` (no endpoint/field change, no deploy), `apps/web/src/lib/api.ts` (no new API), `SettingsTab` (unchanged).
- **Frontend only.** Verified with `npm run typecheck -w apps/web`. No Worker deploy needed.
