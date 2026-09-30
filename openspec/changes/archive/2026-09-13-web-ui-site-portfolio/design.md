## Context

The homepage (`UserBlogPage.tsx`) is a single long-scroll page under `/blog/u/:userId`. The article page (`BlogPostPage.tsx`) has a reading-progress bar but no TOC. See proposal.md for motivation. Existing reusable data on the user feed (`loadUserPublicFeed`) already carries each note's `noteId`, `title`, `summary`, `category`, `cover`, and `updatedAt`, plus `featuredNoteId`. Notes expose `heading` blocks with `level` 1–3 + `text` (used for TOC).

This change is cross-cutting: it re-architects the homepage into a multi-tab SPA and adds a per-user site configuration persisted in the user profile, plus a worker endpoint and an article TOC.

## Goals / Non-Goals

**Goals:**

- Turn the personal homepage into a state-driven multi-tab site: 首页 (default) / 项目示例 / 博客 / 设置 (owner-only), switched by `activeTab` with a fixed top nav, no URL change per tab.
- Add a persistent per-user site configuration that maps notes into the work region, blog region, and blog category order; readable by any visitor, writable only by the owner.
- Home tab: immersive cinematic hero (static copy + mouse-interactive game-themed effects, gradient+grain bg), scroll-through sections, and auto-advance to the next tab at the content end (desktop + mobile).
- Work tab: scrollable bento/grid of note-driven portfolio cards (cover/title/summary/View Project, tag/spine + metric label).
- Blog tab: category-grouped note cards (cover/title/summary/date); category grouping uses the note `category` by default with optional site-config order.
- Article TOC: right-side click-to-scroll heading index with active-section highlight.
- Graceful placeholders when the owner hasn't configured anything.

**Non-Goals:**

- No per-tab route URLs (tabs are state, not path segments).
- No new note fields; the site config is separate profile metadata.
- No changes to Auth, the note schema, or the asset pipeline.
- No changes to the article/hub/feed read behavior beyond adding the article TOC.
- No changes to the existing global blog hub (`/blog`) or circle flows.

## Decisions

**D1 — Tab shell is state-driven, not routed.**
`UserBlogPage` becomes a container holding `activeTab` (`'home' | 'work' | 'blog' | 'settings'`) and a fixed top nav. Clicking a tab sets state and renders the matching tab component. Rationale: the user explicitly chose state switching, the hero's "scroll to end → next tab" needs programmatic control, and per-tab URLs would force route/basename changes across the app. Alternative rejected: sub-routes — higher churn, and the hero auto-advance would need `navigate()`.

**D2 — Site config lives in the user profile, extended.**
`UserProfile` (in `workers/api/src/userProfile.ts`, stored at `data/users/{userId}/profile.json`) gains an optional `site` field:

```ts
interface SiteConfig {
  workNoteIds?: string[];        // ordered work region notes
  blogNoteIds?: string[];        // ordered blog region notes
  blogCategoryOrder?: string[];  // optional blog category ordering
}
interface UserProfile { schemaVersion: 1; featuredNoteId?: string; site?: SiteConfig; }
```

Reuses existing `loadUserProfile`/`saveUserProfile` (already used by `/api/profile/featured`). Alternative considered: a separate `site.json` file — more moving parts; profile.json already centralizes per-user metadata.

**D3 — Two new worker endpoints on the existing auth model.**
- `GET /api/public/users/:id/site` — public read of the site config (mirrors the existing public feed route; no token needed for read).
- `PUT /api/profile/site` — write, requires `verifyUserToken`, and only allows the owner (`user.id` must equal the authored user's id; for simplicity the route writes to `user.id`'s own profile, i.e. an owner edits their own site). Reuses `unauthorized()`/`forbidden()`/`json()` helpers and `putFile(..., 'update site config')`.
The user feed response (`GET /api/public/users/:id/feed`) also includes `site` so the frontend loads config in one call. Rationale: minimal endpoints, consistent with the existing `/api/profile/featured` precedent. Alternative rejected: folding into the generic notes API — topics are unrelated.

**D4 — The tab components resolve assigned note ids against the fetched feed.**
`UserBlogPage` keeps its existing `loadUserPublicFeed` fetch (posts + site). Each tab receives `posts` and the site config and filters/maps note ids → `PublicFeedItem`. A note id not present in the current public feed is dropped (private / not-public notes are simply not shown). Rationale: no per-note fetch needed; keep all driven by the already-loaded feed. Alternative: fetching full notes for richer body — out of scope, cards only need feed fields.

**D5 — Home: immersive hero + scroll-through + auto-advance.**
Home is `HomeTab` with one or more full-viewport sections. The hero is static copy (overline pill, two-line serif display heading with the second line italic/gradient, subtitle) plus a game-themed mouse-interactive decoration (e.g. a canvas of cursor-following particles/constellation) implemented with a lightweight `requestAnimationFrame` loop, disabled under reduced motion. Scroll-through uses a wheel/touch handler (throttled, passive) that advances an abstract "section index"; when the user pushes past the last content section, `HomeTab` calls the container's `onAdvance()` to switch `activeTab` to `'work'`. On touch devices a momentum/touch-end threshold triggers the same advance. All under `useMotionSafe()` guards.

**D6 — Work/Blog render as bento/cards driven by feed.**
`WorkTab`: a "SELECTED WORKS" header + a responsive grid (or horizontal snap track) of large bento cards from `workNoteIds`, each with cover, title, summary, `View Project →` link to the note, a tag/spine row, and a metric label (derived from the note, e.g. read time or a static accent — the reference shows fictional metrics; we derive or omit). `BlogTab`: category-grouped list of note cards (cover/title/summary/date) from `blogNoteIds`, grouped by `category` (default) or by `blogCategoryOrder` when configured. Both use `Reveal` for scroll reveal.

**D7 — Article TOC from heading blocks.**
`BlogPostPage` gains a right-side `ArticleToc` that reads the loaded note's `blocks`, filters `type === 'heading'`, and builds an index (indent by level). Entries render with anchors; clicking calls `scrollIntoView` on the corresponding rendered heading (the article renderer emits `id` per heading or we locate by block id). A scroll listener (rAF-throttled, passive) tracks the section in view and highlights the active entry. Collapsed to an accessible summary/toggle on mobile.

**D8 — Placeholders everywhere when unconfigured.**
If a region has zero assigned notes (or site config is absent), the tab shows a friendly empty state (icon + text) prompting the owner to configure (and for visitors, a neutral "nothing here yet"). Never a blank or broken render.

## Risks / Trade-offs

- [Wheel/touch auto-advance can feel janky or misfire] → Throttle + require crossing a threshold at the content end; gate by `useMotionSafe`; throttle via rAF and only act at the last section.
- [Canvas particle loop can cost on low-end devices] → Cap particle count, pause when tab hidden / document not focused, disable under reduced motion.
- [Site config referencing note ids not in the public feed] → Dropped silently; note ids for private/`circle` notes simply won't resolve to public cards. Owner-only settings still lists available public notes.
- [Put endpoint exposes profile write] → Only owner can write own profile; non-owner gets `forbidden()`. Public read is intentionally open (site is public), matching the existing public feed.
- [Category grouping mismatch if `category` path changes] → Group by the top-level or full `category` string consistently; owner can tune via `blogCategoryOrder` in settings.
- [Needs a Worker deploy for the new endpoints] → Rolling, low risk; rollback = revert the deployed worker.
