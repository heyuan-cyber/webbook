## Why

Phases 1–2 gave WebBook tokens, materiality, and a composed typography/layout. The remaining "炫酷 / 高端" gap is **deliberate motion**: route transitions, stage-canvas pan/zoom inertia, block enter/exit, and animated menus/toasts. This increment adds a motion layer driven by the existing motion tokens, and always honors `prefers-reduced-motion`.

## What Changes

- Add the `motion` dependency (Framer Motion; small, tree-shaken).
- **Route transitions** via `AnimatePresence` on the main routes (`App.tsx`).
- **Stage editor motion**: eased canvas pan/zoom (inertia), block insert/remove enter/exit, drag feedback.
- **Chrome motion**: animated menus/popovers (slash, insert, history) and toasts.
- `prefers-reduced-motion` global fallback (non-essential animation disabled).
- No backend/API/data changes.

## Capabilities

### New Capabilities
- `web-ui-motion`: Deliberate motion language for WebBook — route transitions, stage canvas inertia, block enter/exit, and animated menus/toasts, all motion-token-driven and reduced-motion-safe.

### Modified Capabilities
<!-- None: new capability. -->

## Impact

- **Dependency**: add `motion` (bundle +~, mitigated by reduced-motion and small usage).
- **Front end**: `apps/web/src/App.tsx` (routes), `UserApp`/`NoteEditor`/`components/editor/*` (stage), `AppShell` + toast/menu components.
- **Systems**: no Worker/API/data changes; PWA build unchanged.
