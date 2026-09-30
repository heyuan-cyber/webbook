## Why

The personal homepage currently reads as a clean, centered blog index (v5 cinematic neon). It works but it does not feel like a **multi-discipline immersive portfolio** — the kind of "immersive technologist" landing page that impresses when shown to others. We want the homepage to feel premium / cinematic / mature-commercial: a full-viewport hero, a starring featured work, and numbered discipline sections that give the author's body of work a real sense of weight and craft — without adding any new note fields or backend work.

## What Changes

This change restyles the existing personal homepage (`UserBlogPage`) and its CSS. It is **visual-only** — it reuses the already-available `cover`, `category` (nested column path), and `featuredNoteId` data. No new note schema, no new API fields, no Worker deploy.

- **Immersive full-viewport hero** — replace the small centered card with a cinematic, full-bleed hero: layered fixed gradient + film-grain background (chosen: no dependency on any cover), oversized display name in gold/teal neon glow, an overline tagline, avatar reduced to a badge, a scroll cue, and the existing entry actions.
- **Featured work hero spot** — elevate the spotlighted (★) note into a wide, movie-poster-like feature card (cover, title, summary, kicker, CTA); keep the "焦点作品待定" placeholder when nothing is starred.
- **Discipline sections** — turn the uniform `domain-grid` cards into numbered, left-aligned discipline blocks ("01 游戏开发 / 02 计算机基础 …"), each with an editor's lede and its own responsive card stream, replacing the flat equal-width grid.
- **Demo showcase** — keep the cover marquee but present it as a snap-heavy "作品演示" band with a section title.
- **Gallery** — keep the masonry "全部文章" but restyle with translucent glass cards + neon hover outlines for a more premium feel.
- **Scroll-driven motion** — the hero content scrolls away/fades as you scroll; discipline titles reveal on scroll; desktop gets stronger parallax, mobile and `prefers-reduced-motion` degrade gracefully.
- **Cinematic polish** — reuse existing `--accent` (gold) / teal tokens + grain/gradient; no new palette.

**Non-goals:** no engine/platform tags, no play/repo links, no new note fields, no changes to the article, blog hub, or feed pages, no data-model changes, no deploy.

## Capabilities

### New Capabilities

None. This is a restyle of an existing capability.

### Modified Capabilities

- `web-ui-personal-site`: the homepage is restyled from a centered blog index into an immersive, cinematic multi-discipline portfolio. Hero becomes full-viewport with a fixed gradient + grain background (not dependent on a cover); a featured-work hero spot replaces the inline spotlight; knowledge-domain cards become numbered discipline sections; the marquee becomes a titled demo band; the gallery and all section motion receive cinematic polish. Behavior data (`cover`/`category`/`featuredNoteId`) and entry points are unchanged.

## Impact

- **Code changed:** `apps/web/src/pages/UserBlogPage.tsx` (hero, spot, discipline sections, demo band, gallery, scroll state) and `apps/web/src/styles/layout.css` (new immersive classes + `@media`/reduced-motion guards).
- **Unchanged:** `packages/shared` (no model change), `workers/api` (no endpoint/field change, no deploy), `apps/web/src/lib/api.ts` (no new API).
- **Frontend only.** Verified with `npm run typecheck -w apps/web`. No Worker deploy needed for this change.
