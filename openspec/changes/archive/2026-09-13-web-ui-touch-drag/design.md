## Context

The stage viewport (`StageViewport.tsx`) handles panning, marquee selection, and pinch zoom. Verified in code:

- `onPointerDown` (line 308) starts panning only for `e.button === 1 || e.button === 2` (line 319) — middle/right mouse button. Touch always reports `button === 0`.
- The `button === 0` path (line 344) starts the **marquee** (`marqueeDrag`), which is what a phone user sees as a blue rectangle.
- Touch handling (line 465) only implements two-finger pinch (`e.touches.length !== 2` → bail), so there is **no single-finger pan**.
- `.stage-absolute-block` (`layout.css:3684`) has only `position: absolute` — no `touch-action`/`user-select`, and `touch-action` is not inherited, so a finger drag on a panel can be cancelled by the browser.

## Goals / Non-Goals

**Goals:**

- One-finger drag on blank stage pans the canvas on touch/pen devices.
- The marquee is a mouse-only affordance (unchanged on desktop).
- Finger-dragging a panel moves it and is not hijacked/cancelled by the browser.
- Keep two-finger pinch and all desktop mouse behavior identical.

**Non-Goals:**

- No change to desktop mouse bindings (middle/right pan, left marquee, block drag).
- No visual redesign; no backend/data change.
- No new gestures beyond single-finger pan.

## Decisions

**D1 — Branch on `pointerType` in the stage's `onPointerDown`.**
When the pointer is touch/pen and the target is blank canvas (`!shouldSkipStagePan(target)`), start the existing `panDrag` (the same code path the middle-button uses) instead of `marqueeDrag`. Reuse `panDrag` so panning maths, capture, and thresholds stay identical. Alternative: add separate touch handlers — duplicates logic and risks double-handling.

**D2 — Marquee only for mouse.**
Guard the marquee branch with `e.pointerType === 'mouse'`. Touch therefore never draws the selection rectangle. Alternative: keep marquee on touch long-press — extra complexity for a gesture that box-selects blocks, which is impractical on a phone.

**D3 — Block drag wins over pan.**
The existing `shouldSkipStagePan` guard (which matches `[data-stage-block]`) is kept, so a touch starting on a panel never reaches the pan/marquee branch; the panel's own pointer-drag handles it. This requires the panel's drag to actually fire on touch, hence D4.

**D4 — Guard panels against browser gesture hijack.**
Add `touch-action: none;` and `-webkit-user-select: none; user-select: none;` to `.stage-absolute-block` so the browser does not consume the drag as scroll/selection. Interactive children (inputs/textarea/contenteditable) keep working because the existing skip list already excludes them from panel-drag, and text fields retain their own selection behaviour.

**D5 — `panDrag` gets a pointer-type-agnostic drag.**
`panDrag` currently ignores `button`, so reusing it for touch is safe. `setPointerCapture` is already called when panning begins (line 340) — call it for the touch path too so the pan continues if the finger leaves the viewport.

## Risks / Trade-offs

- [Touch pan could conflict with page scroll] → `.stage-viewport` already has `touch-action: none`, so the stage never scrolled the page; panning is the expected behaviour there.
- [Accidental pan while trying to tap a block] → `shouldSkipStagePan` keeps block drags on blocks; the pan only starts from blank canvas.
- [Pointer capture on touch ends the pan] → capture is set when the movement threshold is crossed, mirroring the mouse path.
- [Cannot verify real touch in this environment] → Implement per spec and verify logic with synthetic pointer events; final confirmation is on a real device.
