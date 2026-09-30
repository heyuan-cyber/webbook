## Context

WebBook web UI is React 18 + Vite PWA (`apps/web`), plain CSS with the Phase-1 token layer (`--dur-fast/-base/-slow`, `--ease`, `--ease-out`) and Phase-2 typography/layout. The app shell and routes live in `App.tsx` (react-router `Routes`), the editor/stage in `components/editor/*`, and chrome (slash/insert/history menus, toasts) in `components` + `global.css`. No motion library today. See proposal.md; `web-ui-motion` spec defines the observable behavior.

## Goals / Non-Goals

**Goals:**
- Route transitions (fade/translate) via AnimatePresence.
- Stage canvas pan/zoom easing + block enter/exit.
- Menu/popover + toast animations.
- Reduced-motion-safe; token-driven durations/easings.

**Non-Goals:**
- No backend/data changes; no changes to the stage's interaction logic (only animation).
- No full redesign of editor semantics; no heavy animation library beyond `motion`.

## Decisions

- **Use `motion` (Framer Motion)** for React-friendly declarative animation. *Alternative:* GSAP (overkill for this), CSS-only (insufficient for AnimatePresence exit + stage springs). Bundle cost mitigated by small usage.
- **Route transitions**: wrap `<Routes>` in `AnimatePresence mode="wait"` keyed by `location.pathname`, each route in a `motion.div` fade/translate. *Alternative:* none needed (react-router compatible).
- **Stage motion**: camera pan/zoom via `motion`/`useSpring` inertia; block enter/exit via `AnimatePresence` + `layout` on block wrappers.
- **Chrome motion**: animate menus/popovers/toasts with fade/scale; reuse `--dur-*`/`--ease` tokens.
- **Reduced-motion**: a `useReducedMotion()`/media check disables decorative animation; durations collapse to ~0.
- **Tokens**: map `--dur-fast/--dur-base/--dur-slow` and `--ease/--ease-out` into motion transition values.

## Risks / Trade-offs

- **[Bundle growth]** → tree-shaken `motion`, minimal usage, reduced-motion short-circuits.
- **[Stage perf on low-end]** → springs limited to camera; block transitions lightweight; throttle when not needed.
- **[AnimatePresence route keys]** → key by pathname to avoid ordering bugs; keep transitions short.
- **[Reduced-motion]** → must not leave state broken, only animation off.

## Open Questions

- Exact easing/durations tuned by feel — token-driven so tweakable without code change.
