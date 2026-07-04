import { useRef, useState, type ReactNode } from 'react';
import type { ImageBlock } from '@webbook/shared';
import { assetUrl } from '@/lib/api';
import { cropFrameStyle, cropImageStyle, FULL_CROP } from '@/lib/imageDisplay';
import { IMAGE_BLOCK_DRAG_TYPE } from './canvasDrag';
import { ImageCropModal } from './ImageCropModal';
import { ImageLightbox } from './ImageLightbox';

interface Props {
  blockId: string;
  block: ImageBlock;
  readOnly: boolean;
  onPatch: (patch: Partial<ImageBlock>) => void;
  uploadRow: ReactNode;
}

export function ImageBlockView({ blockId, block, readOnly, onPatch, uploadRow }: Props) {
  const [lightbox, setLightbox] = useState(false);
  const [cropping, setCropping] = useState(false);
  const freeDrag = useRef<{ dx: number; dy: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const src = assetUrl(block.src);
  const crop = block.crop ?? FULL_CROP;
  const isFree = block.layout === 'free';
  const align = block.align ?? 'center';

  function onFreePointerDown(e: React.PointerEvent) {
    if (readOnly || !isFree) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    freeDrag.current = {
      dx: e.clientX - (block.freeX ?? 0),
      dy: e.clientY - (block.freeY ?? 0),
    };
  }

  function onFreePointerMove(e: React.PointerEvent) {
    if (!freeDrag.current || readOnly) return;
    onPatch({
      freeX: Math.max(0, e.clientX - freeDrag.current.dx),
      freeY: Math.max(0, e.clientY - freeDrag.current.dy),
    });
  }

  function onFreePointerUp() {
    freeDrag.current = null;
  }

  const figure = block.src ? (
    <figure
      className={`image-figure image-align-${align} ${isFree ? 'image-figure-free' : ''}`}
      style={isFree ? { minHeight: Math.max(200, (block.freeY ?? 0) + 120) } : undefined}
    >
      {!readOnly && (
        <div className="image-toolbar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onPatch({ layout: isFree ? 'inline' : 'free', freeX: 0, freeY: 0 })}
          >
            {isFree ? '嵌入文档流' : '自由定位'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCropping(true)}>
            裁剪
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLightbox(true)}>
            预览
          </button>
          <label className="image-width-label">
            宽度
            <input
              type="range"
              min={120}
              max={900}
              value={block.width ?? 400}
              onChange={(e) => onPatch({ width: Number(e.target.value) })}
            />
          </label>
          <select
            className="image-align-select"
            value={align}
            onChange={(e) => onPatch({ align: e.target.value as ImageBlock['align'] })}
          >
            <option value="left">左</option>
            <option value="center">中</option>
            <option value="right">右</option>
          </select>
          <span className="muted image-drag-hint">拖入下方画板可移入</span>
        </div>
      )}
      <div
        ref={stageRef}
        className={isFree ? 'image-free-stage' : undefined}
        onPointerMove={onFreePointerMove}
        onPointerUp={onFreePointerUp}
        onPointerCancel={onFreePointerUp}
      >
        <div
          className={`image-crop-frame ${isFree ? 'image-crop-frame-free' : ''} ${!readOnly && block.src ? 'image-draggable' : ''}`}
          draggable={!readOnly && !!block.src}
          onDragStart={(e) => {
            if (readOnly || !block.src) return;
            e.dataTransfer.setData(
              IMAGE_BLOCK_DRAG_TYPE,
              JSON.stringify({
                blockId,
                src: block.src,
                crop: block.crop,
                width: block.width,
              }),
            );
            e.dataTransfer.effectAllowed = 'move';
          }}
          style={{
            ...cropFrameStyle(crop, block.width),
            ...(isFree
              ? {
                  position: 'absolute',
                  left: block.freeX ?? 0,
                  top: block.freeY ?? 0,
                  cursor: readOnly ? 'zoom-in' : 'grab',
                }
              : { cursor: readOnly ? 'zoom-in' : 'grab' }),
          }}
          onClick={readOnly ? () => block.src && setLightbox(true) : undefined}
          onPointerDown={isFree && !readOnly ? onFreePointerDown : undefined}
        >
          <img src={src} alt={block.alt ?? ''} style={cropImageStyle(crop)} draggable={false} />
        </div>
      </div>
      {!readOnly ? (
        <input
          className="url-input image-caption-input"
          placeholder="图片说明（可选）"
          value={block.caption ?? ''}
          onChange={(e) => onPatch({ caption: e.target.value })}
        />
      ) : (
        block.caption && <figcaption className="muted">{block.caption}</figcaption>
      )}
    </figure>
  ) : (
    !readOnly && uploadRow
  );

  return (
    <>
      {figure}
      {lightbox && block.src && (
        <ImageLightbox
          src={src}
          alt={block.alt}
          caption={block.caption}
          onClose={() => setLightbox(false)}
        />
      )}
      {cropping && block.src && (
        <ImageCropModal
          src={src}
          initialCrop={block.crop}
          onSave={(c) => {
            onPatch({ crop: c });
            setCropping(false);
          }}
          onClose={() => setCropping(false)}
        />
      )}
    </>
  );
}
