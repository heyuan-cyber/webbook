import { useCallback, useEffect, useRef, useState } from 'react';
import type { Block, BlockEdgeSide, BlockPlacement, NoteStage } from '@webbook/shared';
import {
  AUTO_SIZE_MAX_HEIGHT,
  AUTO_SIZE_MAX_WIDTH,
  defaultCardSize,
  isPlacementAutoSize,
  stageScale,
} from '@webbook/shared';
import { EditableMarkdownField } from './EditableMarkdownField';
import { LinkPreviewBlockView } from './LinkPreviewBlockView';
import { StageBlockPorts } from './StageBlockPorts';
import type { LiveBlockGeometry } from './StageEdgesLayer';
import { worldPointFromClient } from './stageCoords';
import { useAutoSizeHeight } from './useAutoSizeHeight';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const MIN = 80;
/** 未超过阈值不进入拖拽，避免 pointerdown+preventDefault 吞掉预览区 dblclick */
const DRAG_THRESHOLD_PX = 5;

export type EdgePanClient = { clientX: number; clientY: number };

interface Props {
  block: Block;
  readOnly?: boolean;
  selected?: boolean;
  autoFocus?: boolean;
  showPorts?: boolean;
  stage: NoteStage;
  onSelect: (additive?: boolean) => void;
  onPatch: (patch: Partial<Block>) => void;
  onPortPointerDown: (side: BlockEdgeSide, e: React.PointerEvent) => void;
  onLiveGeometry?: (geo: LiveBlockGeometry | null) => void;
  onEdgePanPointer?: (pointer: EdgePanClient | null) => void;
  /** 组拖时由父级下发的临时几何 */
  liveOverride?: LiveBlockGeometry | null;
}

function viewportOf(el: HTMLElement): HTMLElement | null {
  return el.closest('.stage-viewport');
}

function supportsTextAutoSize(block: Block): boolean {
  return block.type === 'heading' || block.type === 'paragraph';
}

function blockContentKey(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return block.text;
    default:
      return block.type;
  }
}

export function AbsoluteCardBlockView({
  block,
  readOnly,
  selected,
  autoFocus,
  showPorts,
  stage,
  onSelect,
  onPatch,
  onPortPointerDown,
  onLiveGeometry,
  onEdgePanPointer,
  liveOverride,
}: Props) {
  const onLiveGeometryRef = useRef(onLiveGeometry);
  onLiveGeometryRef.current = onLiveGeometry;
  const onEdgePanPointerRef = useRef(onEdgePanPointer);
  onEdgePanPointerRef.current = onEdgePanPointer;
  const stageRef = useRef(stage);
  stageRef.current = stage;

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

  const rootRef = useRef<HTMLDivElement | null>(null);
  const defaults = defaultCardSize(block.type);
  const pl = block.placement ?? {
    mode: 'absolute' as const,
    x: 0,
    y: 0,
    width: defaults.width,
    height: defaults.height,
  };
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const w = pl.width ?? defaults.width;
  const h = pl.height ?? defaults.height;
  const z = pl.z ?? 1;

  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const pending = useRef<{
    pointerId: number;
    sx: number;
    sy: number;
    dx: number;
    dy: number;
  } | null>(null);
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
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const displayX = live?.x ?? liveOverride?.x ?? x;
  const displayY = live?.y ?? liveOverride?.y ?? y;
  const displayW = live?.w ?? liveOverride?.width ?? w;
  const displayH = live?.h ?? liveOverride?.height ?? h;

  const autoSize =
    supportsTextAutoSize(block) && isPlacementAutoSize(pl) && !readOnly;
  const minW = defaults.width;
  const minH = defaults.height;

  const commitPlacement = useCallback(
    (patch: Partial<BlockPlacement>) => {
      onPatch({ placement: { ...pl, mode: 'absolute', ...patch } } as Partial<Block>);
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
    contentKey: blockContentKey(block),
    isBusy: () => Boolean(drag.current || resize.current || pending.current),
    onSize: ({ width, height }) => {
      if (width === w && height === h) return;
      commitPlacement({ width, height });
    },
  });

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

  function beginDrag(dx: number, dy: number, clientX: number, clientY: number) {
    drag.current = { dx, dy };
    const start = { x, y, w, h };
    liveRef.current = start;
    setLive(start);
    reportLive(start);
    setPointer(clientX, clientY);
  }

  function onShellPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    if (
      (e.target as HTMLElement).closest(
        'input, textarea, button, a, select, .md-field.is-editing, .md-field-toolbar, .md-mode-toggle',
      )
    ) {
      onSelect(e.shiftKey);
      return;
    }
    if ((e.target as HTMLElement).closest('.stage-port, .stage-card-handle')) return;
    // 不在此处 preventDefault，以免吞掉预览区 dblclick → 源码
    e.stopPropagation();
    onSelect(e.shiftKey);
    const viewport = viewportOf(e.currentTarget as HTMLElement);
    const pt = worldPointFromClient(viewport, stage, e.clientX, e.clientY);
    if (!pt) return;
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
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) >= DRAG_THRESHOLD_PX) {
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

  function onPointerUp() {
    const pos = liveRef.current;
    const wasResize = Boolean(resize.current);
    const wasDragging = Boolean(drag.current);
    if (pos && (wasDragging || wasResize)) {
      commitPlacement({
        x: pos.x,
        y: pos.y,
        width: pos.w,
        height: pos.h,
        ...(wasResize ? { autoSize: false } : {}),
      });
    }
    pending.current = null;
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
    onSelect(e.shiftKey);
    pending.current = null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-apply when camera moves during drag
  }, [stage.viewCenterX, stage.viewCenterY, stage.viewScale]);

  useEffect(() => {
    if (!autoFocus || readOnly || !rootRef.current) return;
    requestAnimationFrame(() => {
      const el = rootRef.current?.querySelector(
        'input, textarea',
      ) as HTMLElement | null;
      el?.focus();
    });
  }, [autoFocus, readOnly]);

  return (
    <div
      ref={rootRef}
      data-stage-block
      className={`stage-absolute-block stage-absolute-card ${selected ? 'is-selected' : ''} ${
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
      }}
      onPointerDown={onShellPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="stage-card-body">
        {renderCardBody(block, Boolean(readOnly), onPatch, Boolean(autoFocus))}
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
      <StageBlockPorts
        blockId={block.id}
        visible={Boolean(showPorts || selected) && !readOnly}
        onPortPointerDown={onPortPointerDown}
      />
    </div>
  );
}

function renderCardBody(
  block: Block,
  readOnly: boolean,
  onPatch: (patch: Partial<Block>) => void,
  autoFocus: boolean,
) {
  const md = (
    value: string,
    onChange: (v: string) => void,
    opts?: { multiline?: boolean; placeholder?: string; className?: string },
  ) => (
    <EditableMarkdownField
      blockId={block.id}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      defaultEditing={autoFocus}
      activateOn="dblclick"
      multiline={opts?.multiline ?? true}
      placeholder={opts?.placeholder ?? ''}
      inputClassName={opts?.className ?? 'stage-card-textarea'}
    />
  );

  switch (block.type) {
    case 'heading':
      return (
        <div className="stage-card-heading">
          {readOnly ? (
            <span className="muted">H{block.level}</span>
          ) : (
            <select
              className="heading-level"
              data-stage-interactive
              value={block.level}
              title="标题级别"
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                onPatch({ level: Number(e.target.value) as 1 | 2 | 3 } as Partial<Block>)
              }
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
          )}
          {md(block.text, (text) => onPatch({ text } as Partial<Block>), {
            multiline: false,
            placeholder: '标题',
            className: `stage-card-input h-input h${block.level}`,
          })}
        </div>
      );
    case 'paragraph':
      return md(block.text, (text) => onPatch({ text } as Partial<Block>), {
        placeholder: '输入文字…（支持列表/待办 Markdown：- 项、- [ ] 待办、> 标注）',
      });
    case 'video':
      return (
        <input
          className="url-input stage-card-input"
          value={block.src}
          readOnly={readOnly}
          placeholder="视频 URL"
          onChange={(e) => onPatch({ src: e.target.value } as Partial<Block>)}
        />
      );
    case 'divider':
      return <hr />;
    case 'link-preview':
      return (
        <LinkPreviewBlockView
          block={block}
          patch={(p) => onPatch(p as Partial<Block>)}
          readOnly={readOnly}
        />
      );
    default:
      return <div className="muted">{block.type}</div>;
  }
}
