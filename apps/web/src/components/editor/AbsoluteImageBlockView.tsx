import { useRef } from 'react';
import type { BlockPlacement, ImageBlock } from '@webbook/shared';
import { assetUrl } from '@/lib/api';
import { cropFrameStyle, cropImageStyle, FULL_CROP } from '@/lib/imageDisplay';

interface Props {
  block: ImageBlock;
  readOnly?: boolean;
  onPatch: (patch: Partial<ImageBlock>) => void;
}

export function AbsoluteImageBlockView({ block, readOnly, onPatch }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const pl = block.placement ?? { mode: 'absolute' as const, x: 0, y: 0, width: 240, height: 180 };
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const w = pl.width ?? 240;
  const h = pl.height ?? 180;
  const z = pl.z ?? 1;
  const crop = block.crop ?? FULL_CROP;

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
    drag.current = { dx: wx - x, dy: wy - y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || readOnly) return;
    const world = (e.currentTarget as HTMLElement).closest('.stage-world');
    if (!world) return;
    const wr = world.getBoundingClientRect();
    patchPlacement({
      x: e.clientX - wr.left - drag.current.dx,
      y: e.clientY - wr.top - drag.current.dy,
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  if (!block.src) {
    return (
      <div
        data-stage-block
        className="stage-absolute-block stage-absolute-image muted"
        style={{ left: x, top: y, width: w, minHeight: h, zIndex: z }}
      >
        （空图片）
      </div>
    );
  }

  return (
    <div
      data-stage-block
      className="stage-absolute-block stage-absolute-image"
      style={{ left: x, top: y, width: w, zIndex: z }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="canvas-img-frame" style={{ ...cropFrameStyle(crop), height: h }}>
        <img
          src={assetUrl(block.src)}
          alt={block.alt ?? ''}
          style={cropImageStyle(crop)}
          draggable={false}
        />
      </div>
    </div>
  );
}
