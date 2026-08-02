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
  const [naturalAspect, setNaturalAspect] = useState<number | undefined>();
  const freeDrag = useRef<{ dx: number; dy: number } | null>(null);
  const liveRef = useRef<{ x: number; y: number } | null>(null);
  const [liveFree, setLiveFree] = useState<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const src = assetUrl(block.src);
  const crop = block.crop ?? FULL_CROP;
  const isFree = block.layout === 'free';
  const align = block.align ?? 'center';
  const freeX = liveFree?.x ?? block.freeX ?? 0;
  const freeY = liveFree?.y ?? block.freeY ?? 0;

  function onFreePointerDown(e: React.PointerEvent) {
    if (readOnly || !isFree) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const ox = block.freeX ?? 0;
    const oy = block.freeY ?? 0;
    freeDrag.current = {
      dx: e.clientX - ox,
      dy: e.clientY - oy,
    };
    liveRef.current = { x: ox, y: oy };
    setLiveFree({ x: ox, y: oy });
  }

  function onFreePointerMove(e: React.PointerEvent) {
    if (!freeDrag.current || readOnly) return;
    const pos = {
      x: Math.max(0, e.clientX - freeDrag.current.dx),
      y: Math.max(0, e.clientY - freeDrag.current.dy),
    };
    liveRef.current = pos;
    setLiveFree(pos);
  }

  function onFreePointerUp() {
    const pos = liveRef.current;
    if (pos && (pos.x !== (block.freeX ?? 0) || pos.y !== (block.freeY ?? 0))) {
      onPatch({ freeX: pos.x, freeY: pos.y });
    }
    freeDrag.current = null;
    liveRef.current = null;
    setLiveFree(null);
  }

  const figure = block.src ? (
    <figure
      className={`image-figure image-align-${align} ${isFree ? 'image-figure-free' : ''}`}
      style={isFree ? { minHeight: Math.max(200, freeY + 120) } : undefined}
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
            ...cropFrameStyle(crop, block.width, naturalAspect),
            ...(isFree
              ? {
                  position: 'absolute',
                  left: freeX,
                  top: freeY,
                  cursor: readOnly ? 'zoom-in' : 'grab',
                }
              : { cursor: readOnly ? 'zoom-in' : 'grab' }),
          }}
          onClick={readOnly ? () => block.src && setLightbox(true) : undefined}
          onPointerDown={isFree && !readOnly ? onFreePointerDown : undefined}
          onPointerMove={isFree && !readOnly ? onFreePointerMove : undefined}
          onPointerUp={isFree && !readOnly ? onFreePointerUp : undefined}
          onPointerCancel={isFree && !readOnly ? onFreePointerUp : undefined}
        >
          <img
            src={src}
            alt={block.alt ?? ''}
            style={cropImageStyle(crop)}
            draggable={false}
            onLoad={(e) => {
              const im = e.currentTarget;
              if (im.naturalWidth > 0 && im.naturalHeight > 0) {
                setNaturalAspect(im.naturalWidth / im.naturalHeight);
              }
            }}
          />
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
