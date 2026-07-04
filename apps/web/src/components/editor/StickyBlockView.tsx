import { useEffect, useRef } from 'react';
import type { StickyBlock, BlockPlacement } from '@webbook/shared';

const COLORS = ['#fde68a', '#bae6fd', '#bbf7d0', '#fecaca', '#e9d5ff'];

interface Props {
  block: StickyBlock;
  readOnly?: boolean;
  autoFocus?: boolean;
  onPatch: (patch: Partial<StickyBlock>) => void;
}

export function StickyBlockView({ block, readOnly, autoFocus, onPatch }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ dx: number; dy: number; px: number; py: number } | null>(null);
  const pl = block.placement ?? { mode: 'absolute' as const, x: 0, y: 0, width: 200, height: 140 };
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const w = pl.width ?? 200;
  const h = pl.height ?? 140;
  const z = pl.z ?? 1;

  function patchPlacement(patch: Partial<BlockPlacement>) {
    onPatch({ placement: { ...pl, mode: 'absolute', ...patch } });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const world = (e.currentTarget as HTMLElement).closest('.stage-world');
    if (!world) return;
    const wr = world.getBoundingClientRect();
    const wx = e.clientX - wr.left;
    const wy = e.clientY - wr.top;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: wx - x, dy: wy - y, px: wx, py: wy };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || readOnly) return;
    const world = (e.currentTarget as HTMLElement).closest('.stage-world');
    if (!world) return;
    const wr = world.getBoundingClientRect();
    const wx = e.clientX - wr.left;
    const wy = e.clientY - wr.top;
    patchPlacement({
      x: wx - drag.current.dx,
      y: wy - drag.current.dy,
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  useEffect(() => {
    if (autoFocus && !readOnly) {
      requestAnimationFrame(() => textRef.current?.focus());
    }
  }, [autoFocus, readOnly]);

  return (
    <div
      data-stage-block
      className="stage-absolute-block sticky-block"
      style={{
        left: x,
        top: y,
        width: w,
        minHeight: h,
        zIndex: z,
        background: block.color ?? COLORS[0],
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {!readOnly && (
        <div className="sticky-toolbar">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="sticky-color-dot"
              style={{ background: c }}
              title="换色"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onPatch({ color: c })}
            />
          ))}
        </div>
      )}
      <textarea
        ref={textRef}
        className="sticky-text"
        value={block.text}
        readOnly={readOnly}
        placeholder="便签内容…"
        onChange={(e) => onPatch({ text: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
