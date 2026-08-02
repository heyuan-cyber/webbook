/** 舞台世界坐标与 blocks[] 插入位置 */

import type { NoteStage } from '@webbook/shared';
import { stageScale } from '@webbook/shared';

export interface WorldPoint {
  x: number;
  y: number;
}

const PAN_SKIP_SELECTOR =
  '[data-stage-block], [data-stage-interactive], input, textarea, button, a, select, label, .md-field-preview, .md-field-toolbar, .md-mode-toggle, .canvas-surface, .canvas-el, .block-row, .stage-block-picker, .stage-composer, .insert-menu, .slash-menu';

const WHEEL_SKIP_SELECTOR =
  'input, textarea, select, .md-field-preview, .sticky-text, .canvas-text, .para-input, .list-input, .callout-input, .image-lightbox-backdrop, .image-lightbox, .image-crop-backdrop';

export function shouldSkipStagePan(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(PAN_SKIP_SELECTOR));
}

export function shouldSkipStageWheel(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(WHEEL_SKIP_SELECTOR));
}

/** 视口屏幕坐标 → 世界坐标（考虑 viewCenter + viewScale） */
export function worldPointFromClient(
  viewportEl: HTMLElement | null,
  stage: NoteStage,
  clientX: number,
  clientY: number,
): WorldPoint | null {
  if (!viewportEl) return null;
  const rect = viewportEl.getBoundingClientRect();
  const s = stageScale(stage);
  return {
    x: stage.viewCenterX + (clientX - (rect.left + rect.width / 2)) / s,
    y: stage.viewCenterY + (clientY - (rect.top + rect.height / 2)) / s,
  };
}

/** 贴边自动平移：返回应加到 viewCenter 的世界增量（朝指针所在边缘方向） */
export function edgeAutoPanWorldDelta(
  viewportEl: HTMLElement,
  clientX: number,
  clientY: number,
  scale: number,
  margin = 40,
  maxSpeedPx = 16,
): WorldPoint {
  const rect = viewportEl.getBoundingClientRect();
  const left = clientX - rect.left;
  const top = clientY - rect.top;
  const right = rect.right - clientX;
  const bottom = rect.bottom - clientY;
  const s = scale > 0 ? scale : 1;
  let vx = 0;
  let vy = 0;
  if (left < margin) vx = -maxSpeedPx * (1 - Math.max(0, left) / margin);
  else if (right < margin) vx = maxSpeedPx * (1 - Math.max(0, right) / margin);
  if (top < margin) vy = -maxSpeedPx * (1 - Math.max(0, top) / margin);
  else if (bottom < margin) vy = maxSpeedPx * (1 - Math.max(0, bottom) / margin);
  return { x: vx / s, y: vy / s };
}

/** 世界坐标 → 相对 stage-viewport 的像素偏移（用于 HUD，不受 scale 二次放大） */
export function viewportOffsetFromWorld(
  viewportEl: HTMLElement | null,
  stage: NoteStage,
  world: WorldPoint,
): { x: number; y: number } | null {
  if (!viewportEl) return null;
  const rect = viewportEl.getBoundingClientRect();
  const s = stageScale(stage);
  return {
    x: rect.width / 2 + (world.x - stage.viewCenterX) * s,
    y: rect.height / 2 + (world.y - stage.viewCenterY) * s,
  };
}

/** 以光标为锚缩放：返回新的 viewCenter + viewScale */
export function zoomStageAtClient(
  viewportEl: HTMLElement,
  stage: NoteStage,
  clientX: number,
  clientY: number,
  nextScale: number,
): NoteStage {
  const rect = viewportEl.getBoundingClientRect();
  const s0 = stageScale(stage);
  const s1 = nextScale;
  const ox = clientX - (rect.left + rect.width / 2);
  const oy = clientY - (rect.top + rect.height / 2);
  const wx = stage.viewCenterX + ox / s0;
  const wy = stage.viewCenterY + oy / s0;
  return {
    viewCenterX: wx - ox / s1,
    viewCenterY: wy - oy / s1,
    viewScale: s1,
  };
}

/** 按世界 Y 落在 flow 列哪一段，决定 absolute 块插入 blocks[] 的索引 */
export function findInsertIndexForWorldY(
  flowRoot: HTMLElement | null,
  worldY: number,
  blockCount: number,
): number {
  if (!flowRoot || blockCount === 0) return 0;
  const rows = flowRoot.querySelectorAll<HTMLElement>('[data-block-index]');
  if (!rows.length) return blockCount;

  let insertAfter = -1;
  for (const row of rows) {
    const idx = Number(row.getAttribute('data-block-index'));
    if (!Number.isFinite(idx)) continue;
    const mid = row.offsetTop + row.offsetHeight / 2;
    if (worldY >= mid) insertAfter = idx;
  }
  return Math.min(blockCount, insertAfter + 1);
}
