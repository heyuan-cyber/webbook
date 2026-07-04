import { useRef, useState, type ReactNode } from 'react';
import type { NoteStage } from '@webbook/shared';
import {
  shouldSkipStagePan,
  worldPointFromClient,
  type WorldPoint,
} from './stageCoords';

interface Props {
  stage: NoteStage;
  onStageChange: (stage: NoteStage) => void;
  readOnly?: boolean;
  flow: ReactNode;
  absolute: ReactNode;
  composer?: ReactNode;
  onBlankDoubleClick?: (point: WorldPoint) => void;
}

const PAN_THRESHOLD = 5;
const DBLCLICK_MS = 400;
const DBLCLICK_DIST = 10;

export function StageViewport({
  stage,
  onStageChange,
  readOnly,
  flow,
  absolute,
  composer,
  onBlankDoubleClick,
}: Props) {
  const worldRef = useRef<HTMLDivElement | null>(null);
  const panDrag = useRef<{
    sx: number;
    sy: number;
    cx: number;
    cy: number;
    moved: boolean;
    captured: boolean;
  } | null>(null);
  const lastClick = useRef<{ t: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly || e.button !== 0) return;
    if (shouldSkipStagePan(e.target)) return;
    panDrag.current = {
      sx: e.clientX,
      sy: e.clientY,
      cx: stage.viewCenterX,
      cy: stage.viewCenterY,
      moved: false,
      captured: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = panDrag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.abs(dx) < PAN_THRESHOLD && Math.abs(dy) < PAN_THRESHOLD) return;
      d.moved = true;
      d.captured = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setPanning(true);
    }
    onStageChange({
      viewCenterX: d.cx - dx,
      viewCenterY: d.cy - dy,
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = panDrag.current;
    if (d && !d.moved && !readOnly && onBlankDoubleClick) {
      const now = Date.now();
      const prev = lastClick.current;
      if (
        prev &&
        now - prev.t < DBLCLICK_MS &&
        Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DBLCLICK_DIST
      ) {
        const pt = worldPointFromClient(worldRef.current, e.clientX, e.clientY);
        if (pt) onBlankDoubleClick(pt);
        lastClick.current = null;
      } else {
        lastClick.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
    panDrag.current = null;
    setPanning(false);
  }

  return (
    <div
      className={`stage-viewport ${panning ? 'is-panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={worldRef}
        className="stage-world"
        style={{
          transform: `translate(calc(50% - ${stage.viewCenterX}px), calc(50% - ${stage.viewCenterY}px))`,
        }}
      >
        <div className="stage-flow-column" data-stage-interactive>
          {flow}
        </div>
        <div className="stage-absolute-layer">
          {absolute}
          {composer}
        </div>
      </div>
      {!readOnly && (
        <p className="stage-hint muted">空白处双击选块 · 选便签后直接输入 · 拖拽平移画布</p>
      )}
    </div>
  );
}

export function centerStageOn(_stage: NoteStage, x: number, y: number): NoteStage {
  return { viewCenterX: x, viewCenterY: y };
}
