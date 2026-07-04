import { useRef } from 'react';
import type { BlockPlacement, LinkPreviewBlock } from '@webbook/shared';
import { LinkPreviewBlockView } from './LinkPreviewBlockView';

interface Props {
  block: LinkPreviewBlock;
  readOnly?: boolean;
  autoFocus?: boolean;
  onPatch: (patch: Partial<LinkPreviewBlock>) => void;
}

export function AbsoluteLinkBlockView({ block, readOnly, autoFocus, onPatch }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const pl = block.placement ?? { mode: 'absolute' as const, x: 0, y: 0, width: 260, height: 120 };
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const w = pl.width ?? 260;
  const z = pl.z ?? 1;

  function patchPlacement(patch: Partial<BlockPlacement>) {
    onPatch({ placement: { ...pl, mode: 'absolute', ...patch } });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    if ((e.target as HTMLElement).closest('input, button, a, textarea')) return;
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

  return (
    <div
      data-stage-block
      className="stage-absolute-block stage-absolute-link"
      style={{ left: x, top: y, width: w, zIndex: z }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <LinkPreviewBlockView
        block={block}
        patch={onPatch}
        readOnly={readOnly}
        autoFocus={autoFocus}
      />
    </div>
  );
}
