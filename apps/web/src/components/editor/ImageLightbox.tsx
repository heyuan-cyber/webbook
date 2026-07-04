import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.1;

export function ImageLightbox({ src, alt, caption, onClose }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panDrag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(
    null,
  );
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

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const box = viewportRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const cur = scaleRef.current;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cur * factor));
      if (next === cur) return;
      const ratio = next / cur;
      const p = panRef.current;
      setPan({
        x: cx - (cx - p.x) * ratio,
        y: cy - (cy - p.y) * ratio,
      });
      setScale(next);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panDrag.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setPanning(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = panDrag.current;
    if (!d) return;
    setPan({
      x: d.panX + e.clientX - d.startX,
      y: d.panY + e.clientY - d.startY,
    });
  }

  function onPointerUp() {
    panDrag.current = null;
    setPanning(false);
  }

  return (
    <div className="image-lightbox-backdrop" onClick={onClose} role="presentation">
      <figure className="image-lightbox" onClick={(e) => e.stopPropagation()}>
        <div className="image-lightbox-head">
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
          ref={viewportRef}
          className={`image-lightbox-viewport ${panning ? 'is-panning' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={resetView}
        >
          <div
            className="image-lightbox-pan"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
          >
            <img src={src} alt={alt ?? ''} draggable={false} />
          </div>
        </div>
        <p className="image-lightbox-hint muted">滚轮缩放 · 拖拽平移 · 双击重置</p>
        {caption && <figcaption className="muted">{caption}</figcaption>}
      </figure>
    </div>
  );
}
