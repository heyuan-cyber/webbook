# Tasks

## 1. Stage pan/marquee pointer-type split

- [x] 1.1 In `StageViewport.tsx` `onPointerDown`, start a canvas pan (reusing `panDrag`) when the pointer is touch/pen and the target is blank canvas.
- [x] 1.2 Restrict the marquee branch to `e.pointerType === 'mouse'`.
- [x] 1.3 Ensure the touch pan path sets pointer capture when the movement threshold is crossed.

## 2. Panel drag on touch

- [x] 2.1 Add `touch-action: none` and `-webkit-user-select: none; user-select: none;` to `.stage-absolute-block` in `layout.css`.

## 3. Verify

- [x] 3.1 Run `npm run typecheck -w apps/web`.
- [x] 3.2 Run `openspec validate --changes web-ui-touch-drag`.
- [x] 3.3 Logic check: synthetic touch pointerdown on blank canvas starts a pan (no marquee); synthetic mouse pointerdown still starts a marquee.
