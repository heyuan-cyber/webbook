## Context

The personal homepage (`UserBlogPage.tsx`) currently renders a centered v5 cinematic-neon hero plus an inline `Spotlight` (featured post or placeholder), a `DemoMarquee`, a uniform `domain-grid`, and a `masonry` gallery. All data (cover / nested category / featuredNoteId) is already present on the feed from prior work (`web-ui-home-v5-fx`). See proposal.md for motivation.

This change is a **visual restyle only** inside the existing page + its stylesheet. It touches zero data, zero API, zero Worker. The `.env` is currently in mode B (`VITE_API_BASE_URL=http://localhost:8787`) for local worker use; this change does not alter that.

## Goals / Non-Goals

**Goals:**

- Make the homepage read as an immersive, cinematic "multi-discipline portfolio" (immersive-technologist vibe) using only the existing `cover` / `category` / `featuredNoteId` data.
- Keep the existing information architecture (spotlight, marquee showcase, domain sections, masonry, search, category navigation) but reskin the presentation and add scroll-driven motion.
- Reuse existing tokens (gold `--accent` + teal, `--glass-*`, `--shadow-glow`, grain via `body::after`, `--dur-*`/`--ease*`) so the look stays consistent.
- Respect `prefers-reduced-motion` and degrade gracefully on small screens.

**Non-Goals:**

- No note schema changes, no new API fields, no engine/platform tags, no play/repo links.
- No Worker deploy; no change to article / blog-hub / feed pages.
- No new external dependencies (keep using `motion` from `@/lib/motion` and plain CSS).
- No change to entry points or routing.

## Decisions

**D1 — Hero background is a fixed CSS gradient + grain, not a cover.**
Rationale: user explicitly chose "固定风格渐变/颗粒" so the hero is deterministic and always renders; it is decoupled from whether any cover exists. Implementation: an absolutely-positioned, `position: fixed`-layered backdrop inside the hero (`::before`/`::after`-style wrapper or a dedicated `.hero-bg`), reusing `body::after` film grain already in global.css. Alternative rejected: using the featured/cover as background — non-deterministic and already ruled out by the user.

**D2 — Keep one page component; reskin + add a slim scroll hook rather than rewriting.**
Rationale: the page already computes `tree`/`domains`/`marqueePosts`/`featured`. We restructure the JSX into clear sections (hero, spot, demo band, discipline sections, gallery) and reuse the same helpers. We add a tiny scroll-listen hook for the hero fade and section reveal (or reuse `Reveal`). Alternative rejected: splitting into many new components — higher churn for no behavior gain.

**D3 — Domain cards → numbered discipline sections.**
Rationale: "multi-discipline portfolio" needs big numbered headings ("01 游戏开发") with a lede and a responsive card stream, not equal-width boxes. Implementation: keep the click-to-open discipline navigation (selecting a discipline still shows its posts with a "返回全部" control); the numbered blocks are the closed (summary) presentation with a "查看全部 →" that sets `activeCat`. Alternative rejected: dropping navigation entirely — we keep it so readers can still drill in.

**D4 — Featured post is the "hero spot"; placeholder stays.**
Rationale: the starred post is the author's showcase; widen and poster-style it, keep the "焦点作品待定" empty state. No new data needed — `featured` is already derived from `featuredNoteId`.

**D5 — Motion is progressive and motion-safe.**
Rationale: cinematic needs scroll-driven motion, but must not break accessibility or mobile. Implementation: hero fade-on-scroll via a scroll listener + `useMotionSafe()` (already in `@/lib/motion`), section `Reveal` for titles/cards, CSS-transition based parallax on desktop only (media-query gated), and `@media (prefers-reduced-motion: reduce)` to disable animation/parallax (global.css already has a global guard; local overrides use it too).

## Risks / Trade-offs

- [Hero fade via scroll listener may thrash] → Use a single passive listener + rAF throttle, and only attach when not reduced-motion; drop to a CSS-only approach if it proves noisy.
- [Parallax can feel heavy on mobile] → Gate parallax to `min-width` desktop breakpoints; on mobile use simple `Reveal` only.
- [Restyling risks regressions to category/search nav] → Keep the existing `activeCat`/`q` state machine and the `CategoryTree`/search branches untouched; only change their presentation classes.
- [Visual-only, so typecheck is the gate] → Run `npm run typecheck -w apps/web`; no build/deploy needed for this change.
