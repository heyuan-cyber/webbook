import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageCrop } from '@webbook/shared';
import { FULL_CROP, normalizeCrop } from '@/lib/imageDisplay';

interface Props {
  src: string;
  initialCrop?: ImageCrop;
  onSave: (crop: ImageCrop) => void;
  onClose: () => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toNorm(rect: Rect, imgW: number, imgH: number): ImageCrop {
  return normalizeCrop({
    x: rect.x / imgW,
    y: rect.y / imgH,
    width: rect.w / imgW,
    height: rect.h / imgH,
  });
}

function fromNorm(crop: ImageCrop, imgW: number, imgH: number): Rect {
  const c = normalizeCrop(crop);
  return {
    x: c.x * imgW,
    y: c.y * imgH,
    w: c.width * imgW,
    h: c.height * imgH,
  };
}

export function ImageCropModal({ src, initialCrop, onSave, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; start: Rect } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    setRect(fromNorm(initialCrop ?? FULL_CROP, w, h));
  }, [initialCrop]);

  function clampRect(r: Rect, imgW: number, imgH: number): Rect {
    const min = 24;
    let { x, y, w, h } = r;
    w = Math.max(min, Math.min(w, imgW));
    h = Math.max(min, Math.min(h, imgH));
    x = Math.max(0, Math.min(x, imgW - w));
    y = Math.max(0, Math.min(y, imgH - h));
    return { x, y, w, h };
  }

  function onPointerDown(e: React.PointerEvent, mode: DragMode) {
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: { ...rect } };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !natural.w) return;
    const scale = (imgRef.current?.clientWidth ?? natural.w) / natural.w;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    let next = { ...d.start };
    if (d.mode === 'move') {
      next.x += dx;
      next.y += dy;
    } else if (d.mode === 'nw') {
      next.x += dx;
      next.y += dy;
      next.w -= dx;
      next.h -= dy;
    } else if (d.mode === 'ne') {
      next.y += dy;
      next.w += dx;
      next.h -= dy;
    } else if (d.mode === 'sw') {
      next.x += dx;
      next.w -= dx;
      next.h += dy;
    } else if (d.mode === 'se') {
      next.w += dx;
      next.h += dy;
    }
    setRect(clampRect(next, natural.w, natural.h));
  }

  function onPointerUp() {
    drag.current = null;
  }

  const displayScale = imgRef.current?.clientWidth && natural.w
    ? imgRef.current.clientWidth / natural.w
    : 1;
  const displayRect = rect
    ? {
        left: rect.x * displayScale,
        top: rect.y * displayScale,
        width: rect.w * displayScale,
        height: rect.h * displayScale,
      }
    : null;

  return (
    <div className="image-crop-backdrop" onClick={onClose} role="presentation">
      <div className="image-crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="image-crop-modal-head">
          <strong>裁剪图片</strong>
          <div className="image-crop-modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!rect || !natural.w}
              onClick={() => rect && onSave(toNorm(rect, natural.w, natural.h))}
            >
              应用
            </button>
          </div>
        </div>
        <div
          className="image-crop-stage"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img ref={imgRef} src={src} alt="" onLoad={onImgLoad} className="image-crop-source" />
          {displayRect && (
            <div
              className="image-crop-box"
              style={displayRect}
              onPointerDown={(e) => onPointerDown(e, 'move')}
            >
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  <span
                    key={corner}
                    className={`image-crop-handle image-crop-handle-${corner}`}
                    onPointerDown={(e) => onPointerDown(e, corner)}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
