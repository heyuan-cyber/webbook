import { useCallback, useEffect, useRef, useState } from 'react';
import type { StickyBlock, BlockEdgeSide, BlockPlacement, NoteStage } from '@webbook/shared';
import {
  AUTO_SIZE_MAX_HEIGHT,
  AUTO_SIZE_MAX_WIDTH,
  defaultCardSize,
  isPlacementAutoSize,
  stageScale,
} from '@webbook/shared';
import type { EdgePanClient } from './AbsoluteCardBlockView';
import { StageBlockPorts } from './StageBlockPorts';
import type { LiveBlockGeometry } from './StageEdgesLayer';
import { worldPointFromClient } from './stageCoords';
import { useAutoSizeHeight } from './useAutoSizeHeight';

const COLORS = ['#fde68a', '#bae6fd', '#bbf7d0', '#fecaca', '#e9d5ff'];

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN = 80;

interface Props {
  block: StickyBlock;
  readOnly?: boolean;
  autoFocus?: boolean;
  selected?: boolean;
  showPorts?: boolean;
  stage: NoteStage;
  onSelect?: (additive?: boolean) => void;
  onPatch: (patch: Partial<StickyBlock>) => void;
  onPortPointerDown?: (side: BlockEdgeSide, e: React.PointerEvent) => void;
  onLiveGeometry?: (geo: LiveBlockGeometry | null) => void;
  onEdgePanPointer?: (pointer: EdgePanClient | null) => void;
  liveOverride?: LiveBlockGeometry | null;
}

function viewportOf(el: HTMLElement): HTMLElement | null {
  return el.closest('.stage-viewport');
}

export function StickyBlockView({
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
  const textRef = useRef<HTMLTextAreaElement | null>(null);
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
  const onLiveGeometryRef = useRef(onLiveGeometry);
  onLiveGeometryRef.current = onLiveGeometry;
  const onEdgePanPointerRef = useRef(onEdgePanPointer);
  onEdgePanPointerRef.current = onEdgePanPointer;
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const pl = block.placement ?? { mode: 'absolute' as const, x: 0, y: 0, width: 200, height: 140 };
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const w = pl.width ?? 200;
  const h = pl.height ?? 140;
  const z = pl.z ?? 1;
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const displayX = live?.x ?? liveOverride?.x ?? x;
  const displayY = live?.y ?? liveOverride?.y ?? y;
  const displayW = live?.w ?? liveOverride?.width ?? w;
  const displayH = live?.h ?? liveOverride?.height ?? h;

  const autoSize = isPlacementAutoSize(pl) && !readOnly;
  const defaults = defaultCardSize('sticky');
  const minW = defaults.width;
  const minH = defaults.height;

  const commitPlacement = useCallback(
    (patch: Partial<BlockPlacement>) => {
      onPatch({ placement: { ...pl, mode: 'absolute', ...patch } });
    },
    [onPatch, pl],
  );

  useAutoSizeHeight({
    enabled: autoSize && !live,
    rootRef,
    minWidth: minW,
    minHeight: minH,
    currentWidth: w,
    currentHeight: h,
    contentKey: block.text,
    isBusy: () => Boolean(drag.current || resize.current),
    onSize: ({ width, height }) => {
      if (width === w && height === h) return;
      commitPlacement({ width, height });
    },
  });

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
      const dx = (clientX - originClientX) / scale;
      const dy = (clientY - originClientY) / scale;
      let nx = ox;
      let ny = oy;
      let nw = sw;
      let nh = sh;
      if (handle.includes('e')) nw = Math.max(MIN, sw + dx);
      if (handle.includes('s')) nh = Math.max(MIN, sh + dy);
      if (handle.includes('w')) {
        nw = Math.max(MIN, sw - dx);
        nx = ox + (sw - nw);
      }
      if (handle.includes('n')) {
        nh = Math.max(MIN, sh - dy);
        ny = oy + (sh - nh);
      }
      const next = { x: nx, y: ny, w: nw, h: nh };
      liveRef.current = next;
      setLive(next);
      reportLive(next);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    if ((e.target as HTMLElement).closest('textarea, button, input, select')) {
      onSelect?.(e.shiftKey);
      return;
    }
    if ((e.target as HTMLElement).closest('.stage-port, .stage-card-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(e.shiftKey);
    const viewport = viewportOf(e.currentTarget as HTMLElement);
    const pt = worldPointFromClient(viewport, stage, e.clientX, e.clientY);
    if (!pt) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: pt.x - x, dy: pt.y - y };
    const start = { x, y, w, h };
    liveRef.current = start;
    setLive(start);
    reportLive(start);
    setPointer(e.clientX, e.clientY);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current && !resize.current) return;
    setPointer(e.clientX, e.clientY);
    applyFromClient(e.clientX, e.clientY);
  }

  function onPointerUp() {
    const pos = liveRef.current;
    const wasResize = Boolean(resize.current);
    if (pos && (drag.current || resize.current)) {
      commitPlacement({
        x: pos.x,
        y: pos.y,
        width: pos.w,
        height: pos.h,
        ...(wasResize ? { autoSize: false } : {}),
      });
    }
    drag.current = null;
    resize.current = null;
    liveRef.current = null;
    setLive(null);
    reportLive(null);
    clearPointer();
  }

  function onHandleDown(handle: Handle, e: React.PointerEvent) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(e.shiftKey);
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

  useEffect(() => {
    if (autoFocus && !readOnly) {
      requestAnimationFrame(() => textRef.current?.focus());
    }
  }, [autoFocus, readOnly]);

  return (
    <div
      ref={rootRef}
      data-stage-block
      className={`stage-absolute-block sticky-block ${selected ? 'is-selected' : ''} ${
        autoSize ? 'is-autosize' : ''
      } ${autoSize && displayH >= AUTO_SIZE_MAX_HEIGHT - 1 ? 'is-autosize-capped' : ''} ${
        autoSize && displayW >= AUTO_SIZE_MAX_WIDTH - 1 ? 'is-autosize-wide-capped' : ''
      }`}
      style={{
        left: displayX,
        top: displayY,
        width: displayW,
        height: displayH,
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
