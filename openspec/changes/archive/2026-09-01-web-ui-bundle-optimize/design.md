## Context

WebBook front end (React 18 + Vite PWA) registers all routes statically in `apps/web/src/App.tsx`, so every page (the editor/stage, admin, blog, circles) is in the single main chunk (~815 kB). Routing is `react-router` v6; there's already an `AnimatePresence` route transition wrapper. See proposal.md.

## Goals / Non-Goals

**Goals:**
- Split route pages into per-route chunks so the initial bundle is much smaller.
- Keep the app shell (auth, topbar, route transition, toast, command palette) eager.

**Non-Goals:**
- No behavior/visual changes; no third-party chunking config if the default is enough.
- No change to the `motion` usage inside the shell (keeps route transitions).

## Decisions

- **`React.lazy` per route page** with the named-export adapter (`m => ({ default: m.X })`). Wrap the routed tree in a single `Suspense` with a lightweight loader fallback (reuse `.boot`/`.muted` styling). *Alternative:* manual `manualChunks` in Vite — rejected for now (lazy routes are less config and split at the right boundary).
- **Keep shared shell eager** (`App`, `Routed`, `ToastHost`, auth) so first paint is fast and route transitions still animate.
- **Suspense placement** inside the route-transition `motion.div` so a lazy chunk's fallback sits within the transitioned view.

## Risks / Trade-offs

- **[Lazy chunk flash]** → the Suspense fallback is a short, styled loader that matches the theme.
- **[Suspense + route transition]** → the fallback renders before the chunk resolves; acceptable and brief.
