import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { NoteStage } from '@webbook/shared';
import { clampStageScale, stageScale } from '@webbook/shared';
import {
  edgeAutoPanWorldDelta,
  shouldSkipStagePan,
  shouldSkipStageWheel,
  viewportOffsetFromWorld,
  worldPointFromClient,
  zoomStageAtClient,
  type WorldPoint,
} from './stageCoords';

export type WorldRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

interface Props {
  stage: NoteStage;
  onStageChange: (stage: NoteStage) => void;
  readOnly?: boolean;
  flow: ReactNode;
  absolute: ReactNode;
  composer?: ReactNode;
  composerAt?: WorldPoint | null;
  onBlankDoubleClick?: (point: WorldPoint) => void;
  /** 左键单击空白（未拖出框）时清空选中 */
  onBackgroundInteract?: () => void;
  /** 框选过程中（世界坐标矩形） */
  onMarquee?: (rect: WorldRect | null) => void;
  /** 框选结束；若拖出有效框则带 rect */
  onMarqueeEnd?: (rect: WorldRect) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  edgePanClient?: { clientX: number; clientY: number } | null;
}

const PAN_THRESHOLD = 5;
const DBLCLICK_MS = 400;
const DBLCLICK_DIST = 10;
const WHEEL_PAN_FACTOR = 1;
const WHEEL_ZOOM_STEP = 1.08;

function rectFromPoints(a: WorldPoint, b: WorldPoint): WorldRect {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
}

export function StageViewport({
  stage,
  onStageChange,
  readOnly,
  flow,
  absolute,
  composer,
  composerAt,
  onBlankDoubleClick,
  onBackgroundInteract,
  onMarquee,
  onMarqueeEnd,
  onPaste,
  edgePanClient,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const edgePanRef = useRef(edgePanClient);
  edgePanRef.current = edgePanClient;
  const onStageChangeRef = useRef(onStageChange);
  onStageChangeRef.current = onStageChange;
  const onMarqueeRef = useRef(onMarquee);
  onMarqueeRef.current = onMarquee;
  const panDrag = useRef<{
    sx: number;
    sy: number;
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);
  const marqueeDrag = useRef<{
    sx: number;
    sy: number;
    start: WorldPoint;
    moved: boolean;
  } | null>(null);
  const pinch = useRef<{
    dist: number;
    scale: number;
    cx: number;
    cy: number;
  } | null>(null);
  const lastClick = useRef<{ t: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [marqueeScreen, setMarqueeScreen] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const scale = stageScale(stage);
  const hudPos =
    composer && composerAt
      ? viewportOffsetFromWorld(viewportRef.current, stage, composerAt)
      : null;

  const edgePanActive = Boolean(edgePanClient);
  useEffect(() => {
    if (readOnly || !edgePanActive) return;
    let raf = 0;
    let alive = true;
    function tick() {
      if (!alive) return;
      const pointer = edgePanRef.current;
      const viewport = viewportRef.current;
      if (pointer && viewport) {
        const cur = stageRef.current;
        const delta = edgeAutoPanWorldDelta(
          viewport,
          pointer.clientX,
          pointer.clientY,
          stageScale(cur),
        );
        if (delta.x !== 0 || delta.y !== 0) {
          onStageChangeRef.current({
            ...cur,
            viewCenterX: cur.viewCenterX + delta.x,
            viewCenterY: cur.viewCenterY + delta.y,
            viewScale: stageScale(cur),
          });
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [readOnly, edgePanActive]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      if (readOnly) return;
      if (shouldSkipStageWheel(e.target)) return;
      const viewport = viewportRef.current;
      if (!viewport) return;
      e.preventDefault();
      const cur = stageRef.current;

      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY > 0 ? 1 / WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
        const next = clampStageScale(stageScale(cur) * factor);
        if (next === stageScale(cur)) return;
        onStageChange(zoomStageAtClient(viewport, cur, e.clientX, e.clientY, next));
        return;
      }

      const dx = e.shiftKey ? e.deltaY * WHEEL_PAN_FACTOR : e.deltaX * WHEEL_PAN_FACTOR;
      const dy = e.shiftKey ? 0 : e.deltaY * WHEEL_PAN_FACTOR;
      onStageChange({
        ...cur,
        viewCenterX: cur.viewCenterX + dx,
        viewCenterY: cur.viewCenterY + dy,
        viewScale: stageScale(cur),
      });
    }

    function onAuxClick(e: MouseEvent) {
      if (e.button === 1) e.preventDefault();
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('auxclick', onAuxClick);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('auxclick', onAuxClick);
    };
  }, [onStageChange, readOnly]);

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;

    // 中键：平移
    if (e.button === 1) {
      e.preventDefault();
      if (shouldSkipStagePan(e.target) && (e.target as HTMLElement).closest('input, textarea')) {
        return;
      }
      panDrag.current = {
        sx: e.clientX,
        sy: e.clientY,
        cx: stage.viewCenterX,
        cy: stage.viewCenterY,
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button !== 0) return;
    if (shouldSkipStagePan(e.target)) return;

    const start = worldPointFromClient(viewportRef.current, stage, e.clientX, e.clientY);
    if (!start) return;
    marqueeDrag.current = {
      sx: e.clientX,
      sy: e.clientY,
      start,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const pan = panDrag.current;
    if (pan) {
      const dx = e.clientX - pan.sx;
      const dy = e.clientY - pan.sy;
      if (!pan.moved) {
        if (Math.abs(dx) < PAN_THRESHOLD && Math.abs(dy) < PAN_THRESHOLD) return;
        pan.moved = true;
        setPanning(true);
      }
      const s = stageScale(stageRef.current);
      onStageChange({
        ...stageRef.current,
        viewCenterX: pan.cx - dx / s,
        viewCenterY: pan.cy - dy / s,
        viewScale: s,
      });
      return;
    }

    const m = marqueeDrag.current;
    if (!m) return;
    const dx = e.clientX - m.sx;
    const dy = e.clientY - m.sy;
    if (!m.moved) {
      if (Math.abs(dx) < PAN_THRESHOLD && Math.abs(dy) < PAN_THRESHOLD) return;
      m.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const end = worldPointFromClient(viewportRef.current, stageRef.current, e.clientX, e.clientY);
    if (!end) return;
    const world = rectFromPoints(m.start, end);
    onMarqueeRef.current?.(world);
    const left = Math.min(m.sx, e.clientX);
    const top = Math.min(m.sy, e.clientY);
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) {
      setMarqueeScreen({
        left: left - rect.left,
        top: top - rect.top,
        width: Math.abs(e.clientX - m.sx),
        height: Math.abs(e.clientY - m.sy),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (panDrag.current) {
      panDrag.current = null;
      setPanning(false);
      return;
    }

    const m = marqueeDrag.current;
    marqueeDrag.current = null;
    setMarqueeScreen(null);
    onMarqueeRef.current?.(null);

    if (!m) return;

    if (m.moved) {
      const end = worldPointFromClient(viewportRef.current, stageRef.current, e.clientX, e.clientY);
      if (end) onMarqueeEnd?.(rectFromPoints(m.start, end));
      return;
    }

    // 单击空白：清空选中；双击：选块
    onBackgroundInteract?.();
    if (!readOnly && onBlankDoubleClick) {
      const now = Date.now();
      const prev = lastClick.current;
      if (
        prev &&
        now - prev.t < DBLCLICK_MS &&
        Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DBLCLICK_DIST
      ) {
        const pt = worldPointFromClient(viewportRef.current, stageRef.current, e.clientX, e.clientY);
        if (pt) onBlankDoubleClick(pt);
        lastClick.current = null;
      } else {
        lastClick.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  }

  function touchDist(a: React.Touch, b: React.Touch) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (readOnly || e.touches.length !== 2) {
      pinch.current = null;
      return;
    }
    const t0 = e.touches[0]!;
    const t1 = e.touches[1]!;
    pinch.current = {
      dist: touchDist(t0, t1),
      scale: stageScale(stageRef.current),
      cx: (t0.clientX + t1.clientX) / 2,
      cy: (t0.clientY + t1.clientY) / 2,
    };
  }

  function onTouchMove(e: React.TouchEvent) {
    const p = pinch.current;
    const viewport = viewportRef.current;
    if (!p || !viewport || e.touches.length !== 2) return;
    e.preventDefault();
    const t0 = e.touches[0]!;
    const t1 = e.touches[1]!;
    const dist = touchDist(t0, t1);
    if (p.dist < 1) return;
    const next = clampStageScale(p.scale * (dist / p.dist));
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;
    onStageChange(zoomStageAtClient(viewport, stageRef.current, midX, midY, next));
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) pinch.current = null;
  }

  return (
    <div
      ref={viewportRef}
      className={`stage-viewport ${panning ? 'is-panning' : ''} ${marqueeScreen ? 'is-marquee' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onPaste={onPaste}
    >
      <div
        className="stage-world"
        style={{
          transform: `translate(50%, 50%) scale(${scale}) translate(${-stage.viewCenterX}px, ${-stage.viewCenterY}px)`,
          transformOrigin: '0 0',
        }}
      >
        {flow ? (
          <div className="stage-flow-column" data-stage-interactive>
            {flow}
          </div>
        ) : null}
        <div className="stage-absolute-layer">{absolute}</div>
      </div>
      {marqueeScreen && (
        <div
          className="stage-marquee"
          style={{
            left: marqueeScreen.left,
            top: marqueeScreen.top,
            width: marqueeScreen.width,
            height: marqueeScreen.height,
          }}
        />
      )}
      {composer && hudPos && (
        <div
          className="stage-hud-layer"
          style={{ left: hudPos.x, top: hudPos.y }}
        >
          {composer}
        </div>
      )}
      {!readOnly && (
        <p className="stage-hint muted">
          中键拖平移 · 左键框选 · 滚轮平移 · Ctrl+滚轮缩放 · 双击选块 · Shift+点多选
        </p>
      )}
    </div>
  );
}

export function centerStageOn(stage: NoteStage, x: number, y: number): NoteStage {
  return { ...stage, viewCenterX: x, viewCenterY: y, viewScale: stageScale(stage) };
}
