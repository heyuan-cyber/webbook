import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BlockEdgeSide, BlockPlacement, ImageBlock, ImageCrop, NoteStage } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { assetUrl } from '@/lib/api';
import { cropImageStyle, normalizeCrop, stageCropFrameStyle } from '@/lib/imageDisplay';
import {
  beginOptimisticImageUpload,
  revokeLocalImagePreview,
} from './imageUpload';
import { stageImagePlacementSizeFromFile } from './imageSize';
import { ImageLightbox } from './ImageLightbox';
import type { EdgePanClient } from './AbsoluteCardBlockView';
import { BlockAiPanel } from './BlockAiPanel';
import { StageBlockPorts } from './StageBlockPorts';
import type { LiveBlockGeometry } from './StageEdgesLayer';
import { worldPointFromClient } from './stageCoords';
import { toast } from '@/store/useToastStore';

export type ImageLayerAction = 'front' | 'forward' | 'backward' | 'back';

interface Props {
  block: ImageBlock;
  readOnly?: boolean;
  selected?: boolean;
  stage: NoteStage;
  onSelect: (additive?: boolean) => void;
  onPatch: (patch: Partial<ImageBlock>) => void;
  onLayer?: (action: ImageLayerAction) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  showPorts?: boolean;
  onPortPointerDown?: (side: BlockEdgeSide, e: React.PointerEvent) => void;
  onLiveGeometry?: (geo: LiveBlockGeometry | null) => void;
  onEdgePanPointer?: (pointer: EdgePanClient | null) => void;
  liveOverride?: LiveBlockGeometry | null;
}

const DBLCLICK_MS = 400;
const DBLCLICK_DIST = 8;
const DRAG_THRESHOLD = 5;
const IMG_ZOOM_STEP = 1.08;
const MIN_SIZE = 40;

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const EDGE_HANDLES: Handle[] = ['n', 's', 'e', 'w'];

function viewportOf(el: HTMLElement): HTMLElement | null {
  return el.closest('.stage-viewport');
}

function isCorner(h: Handle): boolean {
  return h.length === 2;
}

export function AbsoluteImageBlockView({
  block,
  readOnly,
  selected,
  stage,
  onSelect,
  onPatch,
  onLayer,
  onDuplicate,
  onDelete,
  showPorts,
  onPortPointerDown,
  onLiveGeometry,
  onEdgePanPointer,
  liveOverride,
}: Props) {
  const { session, isGuest } = useAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onLiveGeometryRef = useRef(onLiveGeometry);
  onLiveGeometryRef.current = onLiveGeometry;
  const onEdgePanPointerRef = useRef(onEdgePanPointer);
  onEdgePanPointerRef.current = onEdgePanPointer;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const lastClientRef = useRef<EdgePanClient | null>(null);
  const drag = useRef<{
    dx: number;
    dy: number;
    sx: number;
    sy: number;
    dragging: boolean;
    zoomed: boolean;
  } | null>(null);
  const resize = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startCrop: ImageCrop;
    originClientX: number;
    originClientY: number;
  } | null>(null);
  const liveRef = useRef<{ x: number; y: number } | null>(null);
  const liveBoxRef = useRef<{ x: number; y: number; w: number; h: number; crop: ImageCrop } | null>(
    null,
  );
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const plRef = useRef<BlockPlacement>({ mode: 'absolute' });
  const onPatchRef = useRef(onPatch);

  const pl = block.placement ?? { mode: 'absolute' as const, x: 0, y: 0, width: 240, height: 180 };
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const w = pl.width ?? 240;
  const h = pl.height ?? 180;
  const z = pl.z ?? 1;
  const imgScale = pl.scale ?? 1;
  plRef.current = pl;
  onPatchRef.current = onPatch;

  const crop = normalizeCrop(block.crop);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const [liveBox, setLiveBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    crop: ImageCrop;
  } | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const displayX = liveBox?.x ?? live?.x ?? liveOverride?.x ?? x;
  const displayY = liveBox?.y ?? live?.y ?? liveOverride?.y ?? y;
  const displayW = liveBox?.w ?? liveOverride?.width ?? w * imgScale;
  const displayH = liveBox?.h ?? liveOverride?.height ?? h * imgScale;
  const displayCrop = liveBox?.crop ?? crop;

  function reportLive(geo: {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null) {
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

  function commitPlacement(patch: Partial<BlockPlacement>) {
    onPatch({ placement: { ...pl, mode: 'absolute', ...patch } });
  }

  useEffect(() => {
    if (!selected) {
      setCropMode(false);
      setMenu(null);
    }
  }, [selected]);

  useEffect(() => {
    if (!cropMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setCropMode(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropMode]);

  useEffect(() => {
    if (!menu) return;
    function dismiss() {
      setMenu(null);
    }
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [menu]);

  // 左键+滚轮：等比改宽高（写入 width/height，scale 归 1）
  useEffect(() => {
    const el = rootRef.current;
    if (!el || readOnly) return;

    function onWheel(e: WheelEvent) {
      if (e.buttons !== 1) return;
      if (cropMode) return;
      const d = drag.current;
      if (d?.dragging) return;
      e.preventDefault();
      e.stopPropagation();
      if (d) d.zoomed = true;
      liveRef.current = null;
      setLive(null);

      const curPl = plRef.current;
      const curW = (curPl.width ?? 240) * (curPl.scale ?? 1);
      const curH = (curPl.height ?? 180) * (curPl.scale ?? 1);
      const factor = e.deltaY > 0 ? 1 / IMG_ZOOM_STEP : IMG_ZOOM_STEP;
      const nextW = Math.max(MIN_SIZE, curW * factor);
      const nextH = Math.max(MIN_SIZE, curH * factor);
      onPatchRef.current({
        placement: {
          ...curPl,
          mode: 'absolute',
          width: nextW,
          height: nextH,
          scale: 1,
        },
      });
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [readOnly, cropMode]);

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.stage-img-handle, .stage-port')) return;

    e.preventDefault();
    onSelect(e.shiftKey);
    setMenu(null);

    if (cropMode) return;

    const now = Date.now();
    const prev = lastTap.current;
    if (
      prev &&
      now - prev.t < DBLCLICK_MS &&
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DBLCLICK_DIST
    ) {
      lastTap.current = null;
      drag.current = null;
      setLightbox(true);
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };

    const viewport = viewportOf(e.currentTarget as HTMLElement);
    const pt = worldPointFromClient(viewport, stage, e.clientX, e.clientY);
    if (!pt) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      dx: pt.x - displayX,
      dy: pt.y - displayY,
      sx: e.clientX,
      sy: e.clientY,
      dragging: false,
      zoomed: false,
    };
    liveRef.current = { x: displayX, y: displayY };
    setLive({ x: displayX, y: displayY });
    reportLive({ x: displayX, y: displayY, w: displayW, h: displayH });
    lastClientRef.current = { clientX: e.clientX, clientY: e.clientY };
    onEdgePanPointerRef.current?.(lastClientRef.current);
  }

  function applyDragFromClient(clientX: number, clientY: number) {
    const d = drag.current;
    if (!d || readOnly || d.zoomed || cropMode) return;
    const viewport = viewportOf(rootRef.current!);
    const pt = worldPointFromClient(viewport, stageRef.current, clientX, clientY);
    if (!pt) return;
    const pos = { x: pt.x - d.dx, y: pt.y - d.dy };
    liveRef.current = pos;
    setLive(pos);
    reportLive({ x: pos.x, y: pos.y, w: displayW, h: displayH });
  }

  function onPointerMove(e: React.PointerEvent) {
    const r = resize.current;
    if (r) {
      lastClientRef.current = { clientX: e.clientX, clientY: e.clientY };
      onEdgePanPointerRef.current?.(lastClientRef.current);
      const viewport = viewportOf(rootRef.current!);
      const pt = worldPointFromClient(viewport, stage, e.clientX, e.clientY);
      const origin = worldPointFromClient(viewport, stage, r.originClientX, r.originClientY);
      if (!pt || !origin) return;
      const dx = pt.x - origin.x;
      const dy = pt.y - origin.y;
      const next = cropMode
        ? applyCropResize(r, dx, dy)
        : applyBoxResize(r, dx, dy);
      liveBoxRef.current = next;
      setLiveBox(next);
      reportLive({ x: next.x, y: next.y, w: next.w, h: next.h });
      return;
    }

    const d = drag.current;
    if (!d || readOnly || d.zoomed || cropMode) return;
    if (!d.dragging) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_THRESHOLD) return;
      d.dragging = true;
      lastTap.current = null;
    }
    lastClientRef.current = { clientX: e.clientX, clientY: e.clientY };
    onEdgePanPointerRef.current?.(lastClientRef.current);
    applyDragFromClient(e.clientX, e.clientY);
  }

  function onPointerUp() {
    const r = resize.current;
    const box = liveBoxRef.current;
    if (r && box) {
      if (cropMode) {
        onPatch({
          crop: normalizeCrop(box.crop),
          placement: {
            ...pl,
            mode: 'absolute',
            x: box.x,
            y: box.y,
            width: box.w,
            height: box.h,
            scale: 1,
          },
        });
      } else {
        commitPlacement({
          x: box.x,
          y: box.y,
          width: box.w,
          height: box.h,
          scale: 1,
        });
      }
    } else {
      const d = drag.current;
      const pos = liveRef.current;
      if (d?.dragging && !d.zoomed && pos && (pos.x !== x || pos.y !== y)) {
        commitPlacement({ x: pos.x, y: pos.y });
      }
    }
    resize.current = null;
    liveBoxRef.current = null;
    setLiveBox(null);
    drag.current = null;
    liveRef.current = null;
    setLive(null);
    reportLive(null);
    lastClientRef.current = null;
    onEdgePanPointerRef.current?.(null);
  }

  function onHandleDown(handle: Handle, e: React.PointerEvent) {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(e.shiftKey);
    setMenu(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resize.current = {
      handle,
      startX: displayX,
      startY: displayY,
      startW: displayW,
      startH: displayH,
      startCrop: displayCrop,
      originClientX: e.clientX,
      originClientY: e.clientY,
    };
    const init = {
      x: displayX,
      y: displayY,
      w: displayW,
      h: displayH,
      crop: displayCrop,
    };
    liveBoxRef.current = init;
    setLiveBox(init);
    reportLive({ x: init.x, y: init.y, w: init.w, h: init.h });
    lastClientRef.current = { clientX: e.clientX, clientY: e.clientY };
    onEdgePanPointerRef.current?.(lastClientRef.current);
  }

  useEffect(() => {
    const d = drag.current;
    if (!d?.dragging || d.zoomed || cropMode || resize.current) return;
    const p = lastClientRef.current;
    if (!p) return;
    applyDragFromClient(p.clientX, p.clientY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.viewCenterX, stage.viewCenterY, stage.viewScale]);

  function onContextMenu(e: React.MouseEvent) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(e.shiftKey);
    setMenu({ x: e.clientX, y: e.clientY });
  }

  const showHandles = selected && !readOnly && !lightbox;
  const activeHandles = cropMode ? EDGE_HANDLES : HANDLES;

  function importLocalImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      void (async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const size = await stageImagePlacementSizeFromFile(file);
          const { previewSrc, finalize } = beginOptimisticImageUpload(file, session, isGuest);
          const prev = block.src;
          onPatch({
            src: previewSrc,
            ai: { ...block.ai, source: 'upload', status: 'done' },
            placement: {
              ...pl,
              mode: 'absolute',
              width: size.width,
              height: size.height,
              scale: 1,
            },
          });
          if (prev && prev.startsWith('blob:')) revokeLocalImagePreview(prev);
          void finalize()
            .then((src) => {
              onPatch({ src });
              revokeLocalImagePreview(previewSrc);
              if (isGuest) toast('info', '游客模式：图片仅存本地');
            })
            .catch(() => {
              toast('error', '图片上传失败');
              onPatch({ src: '' });
              revokeLocalImagePreview(previewSrc);
            });
        } catch {
          toast('error', '图片导入失败');
        }
      })();
    };
    input.click();
  }

  const aiPanel =
    selected && !readOnly ? (
      <BlockAiPanel
        kind="image"
        ai={block.ai}
        importLabel="导入"
        onImport={importLocalImage}
        style={{
          left: displayX,
          top: displayY + displayH + 8,
          width: Math.max(displayW, 300),
          zIndex: z + 20,
        }}
        onAiChange={(next) => onPatch({ ai: next })}
        onImageResult={(url) =>
          onPatch({
            src: url,
            ai: { ...block.ai, status: 'done', source: 'ai' },
          })
        }
      />
    ) : null;

  if (!block.src) {
    return (
      <>
        <div
          ref={rootRef}
          data-stage-block
          className={`stage-absolute-block stage-absolute-image muted ${selected ? 'is-selected' : ''}`}
          style={{ left: displayX, top: displayY, width: displayW, minHeight: displayH, zIndex: z }}
          onPointerDown={onPointerDown}
        >
          <div className="stage-image-empty">
            <span>空图片</span>
            {!readOnly && (
              <button
                type="button"
                className="block-ai-import"
                data-stage-interactive
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  importLocalImage();
                }}
              >
                导入本地
              </button>
            )}
          </div>
        </div>
        {aiPanel}
      </>
    );
  }

  return (
    <>
      <div
        ref={rootRef}
        data-stage-block
        className={`stage-absolute-block stage-absolute-image ${selected ? 'is-selected' : ''} ${cropMode ? 'is-cropping' : ''}`}
        style={{
          left: displayX,
          top: displayY,
          width: displayW,
          zIndex: z,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
      >
        <div className="canvas-img-frame" style={stageCropFrameStyle(displayH)}>
          <img
            src={assetUrl(block.src)}
            alt={block.alt ?? ''}
            style={cropImageStyle(displayCrop)}
            draggable={false}
            onLoad={(e) => {
              if (readOnly || liveBox) return;
              const im = e.currentTarget;
              const nw = im.naturalWidth;
              const nh = im.naturalHeight;
              if (!nw || !nh) return;
              const c = normalizeCrop(block.crop);
              const full =
                Math.abs(c.x) < 1e-6 &&
                Math.abs(c.y) < 1e-6 &&
                Math.abs(c.width - 1) < 1e-6 &&
                Math.abs(c.height - 1) < 1e-6;
              if (!full) return;
              const natural = nw / nh;
              const placed = displayW / Math.max(1, displayH);
              if (Math.abs(natural - placed) / natural < 0.03) return;
              const nextH = Math.max(40, Math.round(displayW / natural));
              if (nextH === Math.round(displayH)) return;
              onPatch({
                placement: {
                  ...pl,
                  mode: 'absolute',
                  width: displayW,
                  height: nextH,
                  scale: 1,
                },
              });
            }}
          />
        </div>
        {cropMode && <span className="stage-image-crop-badge">裁剪 · Esc 完成</span>}
          {showHandles &&
          activeHandles.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`stage-img-handle stage-img-handle-${handle}`}
              aria-label={`调整 ${handle}`}
              onPointerDown={(e) => onHandleDown(handle, e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
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
      {menu &&
        createPortal(
          <div
            className="stage-image-menu"
            style={{ left: menu.x, top: menu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLayer?.('front');
                setMenu(null);
              }}
            >
              置于顶层
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLayer?.('forward');
                setMenu(null);
              }}
            >
              上移一层
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLayer?.('backward');
                setMenu(null);
              }}
            >
              下移一层
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLayer?.('back');
                setMenu(null);
              }}
            >
              置于底层
            </button>
            <hr />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setCropMode(true);
                setMenu(null);
              }}
            >
              {cropMode ? '裁剪中…' : '裁剪'}
            </button>
            {cropMode && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCropMode(false);
                  setMenu(null);
                }}
              >
                完成裁剪
              </button>
            )}
            <hr />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onDuplicate?.();
                setMenu(null);
              }}
            >
              复制
            </button>
            <button
              type="button"
              role="menuitem"
              className="stage-image-menu-danger"
              onClick={() => {
                onDelete?.();
                setMenu(null);
              }}
            >
              删除
            </button>
          </div>,
          document.body,
        )}
      {lightbox && (
        <ImageLightbox
          src={assetUrl(block.src)}
          alt={block.alt}
          caption={block.caption}
          onClose={() => setLightbox(false)}
        />
      )}
      {aiPanel}
    </>
  );
}

function applyBoxResize(
  r: {
    handle: Handle;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startCrop: ImageCrop;
  },
  dx: number,
  dy: number,
): { x: number; y: number; w: number; h: number; crop: ImageCrop } {
  let { startX: x, startY: y, startW: w, startH: h } = r;
  const handle = r.handle;

  if (isCorner(handle)) {
    let nx = w;
    let ny = h;
    if (handle.includes('e')) nx = w + dx;
    if (handle.includes('w')) nx = w - dx;
    if (handle.includes('s')) ny = h + dy;
    if (handle.includes('n')) ny = h - dy;
    const rx = nx / w;
    const ry = ny / h;
    const s = Math.abs(dx) * h >= Math.abs(dy) * w ? rx : ry;
    const safe = Math.max(MIN_SIZE / w, MIN_SIZE / h, s);
    const nw = w * safe;
    const nh = h * safe;
    if (handle.includes('w')) x = x + (w - nw);
    if (handle.includes('n')) y = y + (h - nh);
    return { x, y, w: nw, h: nh, crop: r.startCrop };
  }

  if (handle === 'e') w = Math.max(MIN_SIZE, w + dx);
  if (handle === 'w') {
    const nw = Math.max(MIN_SIZE, w - dx);
    x = x + (w - nw);
    w = nw;
  }
  if (handle === 's') h = Math.max(MIN_SIZE, h + dy);
  if (handle === 'n') {
    const nh = Math.max(MIN_SIZE, h - dy);
    y = y + (h - nh);
    h = nh;
  }
  return { x, y, w, h, crop: r.startCrop };
}

/** 裁剪模式：边拖收紧外框并同步改 crop（模式 Y） */
function applyCropResize(
  r: {
    handle: Handle;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startCrop: ImageCrop;
  },
  dx: number,
  dy: number,
): { x: number; y: number; w: number; h: number; crop: ImageCrop } {
  const c = normalizeCrop(r.startCrop);
  let x = r.startX;
  let y = r.startY;
  let w = r.startW;
  let h = r.startH;
  let crop = { ...c };

  if (r.handle === 'e') {
    const nw = Math.max(MIN_SIZE, w + dx);
    const ratio = nw / w;
    crop = { ...crop, width: Math.max(0.05, c.width * ratio) };
    w = nw;
  } else if (r.handle === 'w') {
    const nw = Math.max(MIN_SIZE, w - dx);
    const cut = (w - nw) / w;
    crop = {
      ...crop,
      x: c.x + c.width * cut,
      width: Math.max(0.05, c.width * (nw / w)),
    };
    x = x + (w - nw);
    w = nw;
  } else if (r.handle === 's') {
    const nh = Math.max(MIN_SIZE, h + dy);
    crop = { ...crop, height: Math.max(0.05, c.height * (nh / h)) };
    h = nh;
  } else if (r.handle === 'n') {
    const nh = Math.max(MIN_SIZE, h - dy);
    const cut = (h - nh) / h;
    crop = {
      ...crop,
      y: c.y + c.height * cut,
      height: Math.max(0.05, c.height * (nh / h)),
    };
    y = y + (h - nh);
    h = nh;
  }

  // 向外拖时不允许 crop 超出原图 [0,1]
  crop = normalizeCrop(crop);
  if (crop.x + crop.width > 1) crop.width = 1 - crop.x;
  if (crop.y + crop.height > 1) crop.height = 1 - crop.y;

  return { x, y, w, h, crop };
}
