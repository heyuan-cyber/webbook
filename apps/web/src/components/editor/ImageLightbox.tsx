import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

const MIN_SCALE = 0.1;
const ZOOM_STEP = 1.1;
const PAN_THRESHOLD = 5;

export function ImageLightbox({ src, alt, caption, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panDrag = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  scaleRef.current = scale;
  panRef.current = pan;

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === '0') resetView();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, resetView]);

  // 滚轮直接缩放整图（无需按住左键）；吞掉事件避免驱动舞台
  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    function onBackdropWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const box = backdropRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const cur = scaleRef.current;
      const next = Math.max(MIN_SCALE, cur * factor);
      if (next === cur) return;
      const ratio = next / cur;
      const p = panRef.current;
      setPan({
        x: cx - (cx - p.x) * ratio,
        y: cy - (cy - p.y) * ratio,
      });
      setScale(next);
    }
    backdrop.addEventListener('wheel', onBackdropWheel, { passive: false });
    return () => backdrop.removeEventListener('wheel', onBackdropWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.image-lightbox-chrome')) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panDrag.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = panDrag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      d.moved = true;
      setPanning(true);
    }
    setPan({
      x: d.panX + dx,
      y: d.panY + dy,
    });
  }

  function onPointerUp() {
    panDrag.current = null;
    setPanning(false);
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={`image-lightbox-backdrop ${panning ? 'is-panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('.image-lightbox-chrome')) return;
        resetView();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={alt || caption || '图片预览'}
    >
      <div className="image-lightbox-chrome image-lightbox-head">
        <span className="image-lightbox-zoom-label">{Math.round(scale * 100)}%</span>
        <div className="image-lightbox-head-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetView}>
            重置
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      <div
        className="image-lightbox-stage"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        <img src={src} alt={alt ?? ''} draggable={false} />
      </div>

      <p className="image-lightbox-chrome image-lightbox-hint muted">
        滚轮直接缩放 · 拖拽平移 · 双击重置 · Esc / 关闭
        {caption ? ` · ${caption}` : ''}
      </p>
    </div>,
    document.body,
  );
}
