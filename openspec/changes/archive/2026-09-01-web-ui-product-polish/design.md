## Context

WebBook front end is React 18 + Vite PWA, `zustand` stores (`useNotesStore`, `useToastStore`), `react-router` v6, existing `motion` helper (`apps/web/src/lib/motion.ts`), and the Phase-1 token CSS. Loading today is raw "加载中…", and empty content is bare muted text. This increment is frontend-only, reusing existing dependencies.

## Goals / Non-Goals

**Goals:**
- A keyboard command palette (⌘K) for navigation, note search, and "new note".
- Skeleton shimmer placeholders for tree/feed/article loading.
- Guided empty states for empty tree/editor/blog.

**Non-Goals:**
- No backend/API changes; no new dependency.
- No redesign of the editor/stage; no theming changes.

## Decisions

- **Command palette** built with a lightweight overlay + `useEffect` global keydown for `Ctrl/Cmd+K`, and `AnimatePresence` (from `motion`) for open/close. Actions navigate via `react-router` (`useNavigate`) and map into the notes store for "new note". Reuse the existing glass styling tokens.
- **Skeleton** as a presentational `Skeleton` component + CSS shimmer (`@keyframes` + gradient), used by the surfaced loading spots.
- **Empty state** as a reusable `EmptyState` (icon, title, body, optional CTA) with muted surface styling; shown where content is empty.
- All respect `prefers-reduced-motion` (shimmer disabled) via the existing reduced-motion CSS.

## Risks / Trade-offs

- **[Command palette scope]** → keep to navigate + search-list + new-note; no advanced fuzzy search. Good enough for the polish win.
- **[Verification]** — dev-server watcher crashes (EBUSY) on each file write in this environment, so browser verification is deferred to the user.
