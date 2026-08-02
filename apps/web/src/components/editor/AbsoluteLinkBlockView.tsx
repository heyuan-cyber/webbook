import { useEffect, useRef, useState } from 'react';
import type { BlockEdgeSide, BlockPlacement, LinkPreviewBlock, NoteStage } from '@webbook/shared';
import { stageScale } from '@webbook/shared';
import type { EdgePanClient } from './AbsoluteCardBlockView';
import { LinkPreviewBlockView } from './LinkPreviewBlockView';
import { StageBlockPorts } from './StageBlockPorts';
import type { LiveBlockGeometry } from './StageEdgesLayer';
import { worldPointFromClient } from './stageCoords';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN = 120;
const DRAG_THRESHOLD_PX = 5;
const DBLCLICK_MS = 350;
const DBLCLICK_DIST = 8;

interface Props {
  block: LinkPreviewBlock;
  readOnly?: boolean;
  autoFocus?: boolean;
  selected?: boolean;
  showPorts?: boolean;
  stage: NoteStage;
  onSelect?: (additive?: boolean) => void;
  onPatch: (patch: Partial<LinkPreviewBlock>) => void;
  onPortPointerDown?: (side: BlockEdgeSide, e: React.PointerEvent) => void;
  onLiveGeometry?: (geo: LiveBlockGeometry | null) => void;
  onEdgePanPointer?: (pointer: EdgePanClient | null) => void;
  liveOverride?: LiveBlockGeometry | null;
}

function viewportOf(el: HTMLElement): HTMLElement | null {
  return el.closest('.stage-viewport');
}

function openUrl(url: string) {
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function AbsoluteLinkBlockView({
  block,
  readOnly,
  autoFocus,
  selected,
  showPorts,
  stage,
  onSelect,
  onPatch,
  onPortPointerDown,
  onLiveGeometry,
  onEdgePanPointer,
  liveOverride,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** 按下后尚未超过阈值 */
  const pending = useRef<{
    pointerId: number;
    sx: number;
    sy: number;
    dx: number;
    dy: number;
  } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{
    handle: Handle;
    originClientX: number;
    originClientY: number;
    sw: number;
    sh: number;
    ox: number;
    oy: number;
  } | null>(null);
  const liveRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const lastClientRef = useRef<EdgePanClient | null>(null);
  const didDragRef = useRef(false);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const onLiveGeometryRef = useRef(onLiveGeometry);
  onLiveGeometryRef.current = onLiveGeometry;
  const onEdgePanPointerRef = useRef(onEdgePanPointer);
  onEdgePanPointerRef.current = onEdgePanPointer;
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const pl = block.placement ?? { mode: 'absolute' as const, x: 0, y: 0, width: 260, height: 120 };
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const w = pl.width ?? 260;
  const h = pl.height ?? 120;
  const z = pl.z ?? 1;
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const displayX = live?.x ?? liveOverride?.x ?? x;
  const displayY = live?.y ?? liveOverride?.y ?? y;
  const displayW = live?.w ?? liveOverride?.width ?? w;
  const displayH = live?.h ?? liveOverride?.height ?? h;

  function reportLive(geo: { x: number; y: number; w: number; h: number } | null) {
    if (!geo) {
      onLiveGeometryRef.current?.(null);
      return;
    }
    onLiveGeometryRef.current?.({
      x: geo.x,
      y: geo.y,
      width: geo.w,
      height: geo.h,
      scale: 1,
    });
  }

  function setPointer(clientX: number, clientY: number) {
    const p = { clientX, clientY };
    lastClientRef.current = p;
    onEdgePanPointerRef.current?.(p);
  }

  function clearPointer() {
    lastClientRef.current = null;
    onEdgePanPointerRef.current?.(null);
  }

  function beginDrag(dx: number, dy: number, clientX: number, clientY: number) {
    drag.current = { dx, dy };
    didDragRef.current = true;
    const start = { x, y, w, h };
    liveRef.current = start;
    setLive(start);
    reportLive(start);
    setPointer(clientX, clientY);
  }

  function applyFromClient(clientX: number, clientY: number) {
    const viewport = viewportOf(rootRef.current!);
    const st = stageRef.current;
    if (drag.current) {
      const pt = worldPointFromClient(viewport, st, clientX, clientY);
      if (!pt) return;
      const next = {
        x: pt.x - drag.current.dx,
        y: pt.y - drag.current.dy,
        w: liveRef.current?.w ?? w,
        h: liveRef.current?.h ?? h,
      };
      liveRef.current = next;
      setLive(next);
      reportLive(next);
      return;
    }
    if (resize.current) {
      const { handle, originClientX, originClientY, sw, sh, ox, oy } = resize.current;
      const scale = stageScale(st);
      const ddx = (clientX - originClientX) / scale;
      const ddy = (clientY - originClientY) / scale;
      let nx = ox;
      let ny = oy;
      let nw = sw;
      let nh = sh;
      if (handle.includes('e')) nw = Math.max(MIN, sw + ddx);
      if (handle.includes('s')) nh = Math.max(MIN, sh + ddy);
      if (handle.includes('w')) {
        nw = Math.max(MIN, sw - ddx);
        nx = ox + (sw - nw);
      }
      if (handle.includes('n')) {
        nh = Math.max(MIN, sh - ddy);
        ny = oy + (sh - nh);
      }
      const next = { x: nx, y: ny, w: nw, h: nh };
      liveRef.current = next;
      setLive(next);
      reportLive(next);
    }
  }

  function commitPlacement(patch: Partial<BlockPlacement>) {
    onPatch({ placement: { ...pl, mode: 'absolute', ...patch } });
  }

  function tryOpenFromDoubleTap(clientX: number, clientY: number) {
    if (!block.url) return;
    const now = Date.now();
    const prev = lastTapRef.current;
    if (
      prev &&
      now - prev.t < DBLCLICK_MS &&
      Math.hypot(clientX - prev.x, clientY - prev.y) < DBLCLICK_DIST
    ) {
      lastTapRef.current = null;
      openUrl(block.url);
      return;
    }
    lastTapRef.current = { t: now, x: clientX, y: clientY };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    if ((e.target as HTMLElement).closest('input, button, textarea, select')) {
      onSelect?.(e.shiftKey);
      return;
    }
    if ((e.target as HTMLElement).closest('.stage-port, .stage-card-handle')) return;
    // 不在此处 preventDefault，以免吞掉双击
    e.stopPropagation();
    onSelect?.(e.shiftKey);
    const viewport = viewportOf(e.currentTarget as HTMLElement);
    const pt = worldPointFromClient(viewport, stage, e.clientX, e.clientY);
    if (!pt) return;
    didDragRef.current = false;
    pending.current = {
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      dx: pt.x - x,
      dy: pt.y - y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = pending.current;
    if (p && !drag.current && !resize.current) {
      const dist = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
      if (dist >= DRAG_THRESHOLD_PX) {
        pending.current = null;
        beginDrag(p.dx, p.dy, e.clientX, e.clientY);
        e.preventDefault();
      }
      return;
    }
    if (!drag.current && !resize.current) return;
    setPointer(e.clientX, e.clientY);
    applyFromClient(e.clientX, e.clientY);
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasResize = Boolean(resize.current);
    const wasDragging = Boolean(drag.current);
    const pos = liveRef.current;
    if (pos && (wasDragging || wasResize)) {
      commitPlacement({ x: pos.x, y: pos.y, width: pos.w, height: pos.h });
    }

    const idleTap = !didDragRef.current && !wasResize && !wasDragging;
    pending.current = null;
    drag.current = null;
    resize.current = null;
    liveRef.current = null;
    setLive(null);
    reportLive(null);
    clearPointer();

    if (idleTap && !(e.target as HTMLElement).closest('input, button, textarea, select')) {
      tryOpenFromDoubleTap(e.clientX, e.clientY);
    }
  }

  function onHandleDown(handle: Handle, e: React.PointerEvent) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(e.shiftKey);
    pending.current = null;
    didDragRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = {
      handle,
      originClientX: e.clientX,
      originClientY: e.clientY,
      sw: w,
      sh: h,
      ox: x,
      oy: y,
    };
    const start = { x, y, w, h };
    liveRef.current = start;
    setLive(start);
    reportLive(start);
    setPointer(e.clientX, e.clientY);
  }

  useEffect(() => {
    if (!drag.current && !resize.current) return;
    const p = lastClientRef.current;
    if (!p) return;
    applyFromClient(p.clientX, p.clientY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.viewCenterX, stage.viewCenterY, stage.viewScale]);

  return (
    <div
      ref={rootRef}
      data-stage-block
      className={`stage-absolute-block stage-absolute-link ${selected ? 'is-selected' : ''}`}
      style={{
        left: displayX,
        top: displayY,
        width: displayW,
        height: displayH,
        zIndex: z,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="stage-link-body">
        <LinkPreviewBlockView
          block={block}
          patch={onPatch}
          readOnly={readOnly}
          autoFocus={autoFocus}
          disableCardDoubleClick
        />
      </div>
      {selected &&
        !readOnly &&
        HANDLES.map((handle) => (
          <button
            key={handle}
            type="button"
            className={`stage-img-handle stage-card-handle stage-img-handle-${handle}`}
            onPointerDown={(e) => onHandleDown(handle, e)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        ))}
      {onPortPointerDown && (
        <StageBlockPorts
          blockId={block.id}
          visible={Boolean(showPorts || selected) && !readOnly}
          onPortPointerDown={onPortPointerDown}
        />
      )}
    </div>
  );
}
