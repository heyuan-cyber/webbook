/** 舞台世界坐标与 blocks[] 插入位置 */

export interface WorldPoint {
  x: number;
  y: number;
}

const PAN_SKIP_SELECTOR =
  '[data-stage-block], [data-stage-interactive], input, textarea, button, a, select, label, .md-field-preview, .canvas-surface, .canvas-el, .block-row, .stage-block-picker, .stage-composer, .insert-menu, .slash-menu';

export function shouldSkipStagePan(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(PAN_SKIP_SELECTOR));
}

export function worldPointFromClient(
  worldEl: HTMLElement | null,
  clientX: number,
  clientY: number,
): WorldPoint | null {
  if (!worldEl) return null;
  const rect = worldEl.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
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
