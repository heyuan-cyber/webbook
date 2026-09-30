## Why

On phones the note editor's stage canvas cannot be moved with one finger: dragging blank canvas draws the blue marquee selection rectangle instead of panning. Root cause (confirmed in code): canvas panning is bound to the middle/right mouse button (`StageViewport.tsx:319` — `e.button === 1 || e.button === 2`), which a touch can never produce, while a single-finger touch reports `button === 0` and therefore falls into the marquee branch (`StageViewport.tsx:344`). Touch handling only covers two-finger pinch zoom (`StageViewport.tsx:465`), so there is no single-finger pan at all. Additionally the stage panels (`.stage-absolute-block`) have no `touch-action`/`user-select` guard, so the browser can hijack a finger drag on a panel and cancel it.

## What Changes

Frontend-only touch interaction fixes for the note editor stage. No backend or data change.

- **Single-finger drag on blank canvas pans** — for touch/pen pointers, a one-finger drag on empty stage now pans the canvas instead of starting a marquee selection.
- **Marquee selection becomes mouse-only** — box-select stays a PC (left-click drag) affordance and is never triggered by touch.
- **Panels drag reliably on touch** — the stage panels get `touch-action: none` (and a `-webkit-user-select`/`user-select` guard) so a finger drag on a panel moves it instead of being cancelled by the browser.
- **Two-finger pinch zoom is unchanged**, and dragging a block still takes precedence over panning when the touch starts on a block.

**Non-goals:** no change to the desktop mouse interaction (middle/right-drag pan, left-drag marquee, block drag all stay as they are); no backend/worker change; no visual redesign.

## Capabilities

### New Capabilities

- `web-ui-stage-touch`: touch interaction for the note editor stage — single-finger pan on blank canvas, marquee limited to mouse, reliable panel dragging, and pinch zoom.

### Modified Capabilities

None.

## Impact

- **Code changed (frontend only):** `apps/web/src/components/editor/StageViewport.tsx` (pointer-type branching for pan vs marquee; touch pan), `apps/web/src/styles/layout.css` (`.stage-absolute-block` touch-action/user-select).
- **Unchanged:** `workers/api/**`, `packages/shared/**`, desktop mouse behavior, routing, data shape.
- **No deploy needed** (frontend publishes via GitHub Pages on push). Verified with `npm run typecheck -w apps/web`; final touch behavior must be confirmed on a real device.
