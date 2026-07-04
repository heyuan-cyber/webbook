import { useEffect, useRef, useState } from 'react';
import type { CanvasBlock, CanvasElement, CanvasElementKind } from '@webbook/shared';
import { assetUrl } from '@/lib/api';
import { uid } from '@/lib/id';
import { cropFrameStyle, cropImageStyle, FULL_CROP } from '@/lib/imageDisplay';
import {
  IMAGE_BLOCK_DRAG_TYPE,
  parseImageBlockDrag,
  type ImageBlockDragPayload,
} from './canvasDrag';
import {
  createImageElement,
  fetchLinkMetaForElement,
} from './canvasPaste';
import { handleImageFile } from './imageUpload';

interface Props {
  block: CanvasBlock;
  onChange: (block: CanvasBlock) => void;
  readOnly?: boolean;
  isActive?: boolean;
  onActivate: (x: number, y: number) => void;
  onImageBlockDrop: (payload: ImageBlockDragPayload, x: number, y: number) => void;
  session: { token: string } | null;
  isGuest: boolean;
}

const COLORS = ['#fde68a', '#bae6fd', '#bbf7d0', '#fecaca', '#e9d5ff'];

export function CanvasBlockView({
  block,
  onChange,
  readOnly,
  isActive,
  onActivate,
  onImageBlockDrop,
  session,
  isGuest,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState(false);

  function addElement(kind: CanvasElementKind) {
    const el: CanvasElement = {
      id: uid('el'),
      kind,
      x: 24 + block.elements.length * 16,
      y: 24 + block.elements.length * 16,
      width: kind === 'sticky' ? 160 : kind === 'link' ? 240 : 200,
      height: kind === 'sticky' ? 120 : kind === 'link' ? 88 : 60,
      content: kind === 'image' ? '' : kind === 'link' ? undefined : '双击编辑',
      color: COLORS[block.elements.length % COLORS.length],
      linkUrl: kind === 'link' ? 'https://' : undefined,
      linkTitle: kind === 'link' ? '新链接' : undefined,
    };
    onChange({ ...block, elements: [...block.elements, el] });
  }

  function updateEl(id: string, patch: Partial<CanvasElement>) {
    onChange({
      ...block,
      elements: block.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  }

  function removeEl(id: string) {
    onChange({ ...block, elements: block.elements.filter((e) => e.id !== id) });
    if (selected === id) setSelected(null);
  }

  function surfacePoint(clientX: number, clientY: number) {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: Math.max(0, clientX - rect.left),
      y: Math.max(0, clientY - rect.top),
    };
  }

  function onPointerDown(e: React.PointerEvent, el: CanvasElement) {
    if (readOnly) return;
    e.stopPropagation();
    setSelected(el.id);
    const rect = ref.current!.getBoundingClientRect();
    drag.current = {
      id: el.id,
      dx: e.clientX - rect.left - el.x,
      dy: e.clientY - rect.top - el.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    updateEl(drag.current.id, {
      x: Math.max(0, e.clientX - rect.left - drag.current.dx),
      y: Math.max(0, e.clientY - rect.top - drag.current.dy),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onSurfacePointerDown(e: React.PointerEvent) {
    if (readOnly || e.target !== e.currentTarget) return;
    const pt = surfacePoint(e.clientX, e.clientY);
    onActivate(pt.x, pt.y);
    setSelected(null);
  }

  async function onSurfaceDrop(e: React.DragEvent) {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setDropHint(false);
    const pt = surfacePoint(e.clientX, e.clientY);

    const payload = parseImageBlockDrag(e.dataTransfer.getData(IMAGE_BLOCK_DRAG_TYPE));
    if (payload) {
      onImageBlockDrop(payload, pt.x, pt.y);
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) {
      try {
        const src = await handleImageFile(file, session, isGuest);
        const el = createImageElement(src, pt.x, pt.y);
        onChange({ ...block, elements: [...block.elements, el] });
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    for (const el of block.elements) {
      if (el.kind !== 'link' || !el.linkUrl || el.linkDescription || el.linkImage) continue;
      if (el.linkTitle && el.linkTitle !== el.linkUrl) continue;
      void fetchLinkMetaForElement(el.linkUrl).then((meta) => updateEl(el.id, meta));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅补全缺失元数据
  }, [block.elements]);

  return (
    <div className={`canvas-block ${isActive ? 'canvas-block-active' : ''}`}>
      {!readOnly && (
        <div className="canvas-toolbar">
          <span className="muted">🎨 自由画布{isActive ? '（已选中 · Ctrl+V 粘贴）' : ''}</span>
          <button type="button" className="btn btn-ghost" onClick={() => addElement('sticky')}>
            + 便签
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => addElement('text')}>
            + 文本
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => addElement('image')}>
            + 图片
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => addElement('link')}>
            + 链接
          </button>
          {selected && (
            <button type="button" className="btn btn-ghost" onClick={() => removeEl(selected)}>
              删除选中
            </button>
          )}
        </div>
      )}
      <div
        ref={ref}
        className={`canvas-surface ${dropHint ? 'canvas-surface-drop' : ''}`}
        style={{ height: block.height }}
        tabIndex={readOnly ? undefined : 0}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes(IMAGE_BLOCK_DRAG_TYPE) ||
            e.dataTransfer.types.includes('Files')
          ) {
            e.preventDefault();
            setDropHint(true);
          }
        }}
        onDragLeave={() => setDropHint(false)}
        onDrop={onSurfaceDrop}
      >
        {block.elements.map((el) => (
          <div
            key={el.id}
            className={`canvas-el canvas-el-${el.kind} ${selected === el.id ? 'selected' : ''}`}
            style={{
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              background: el.kind === 'text' || el.kind === 'link' ? 'transparent' : el.color,
            }}
            onPointerDown={(e) => onPointerDown(e, el)}
          >
            {el.kind === 'image' ? (
              el.content ? (
                <div className="canvas-img-frame" style={cropFrameStyle(el.imageCrop ?? FULL_CROP)}>
                  <img
                    src={assetUrl(el.content)}
                    alt=""
                    style={cropImageStyle(el.imageCrop ?? FULL_CROP)}
                    draggable={false}
                  />
                </div>
              ) : (
                <input
                  className="canvas-img-input"
                  placeholder="图片 URL"
                  onChange={(e) => updateEl(el.id, { content: e.target.value })}
                />
              )
            ) : el.kind === 'link' ? (
              <a
                className="canvas-link-card"
                href={el.linkUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {el.linkImage && <img className="canvas-link-thumb" src={el.linkImage} alt="" />}
                <div className="canvas-link-meta">
                  <div className="canvas-link-title">{el.linkTitle ?? el.linkUrl}</div>
                  {el.linkDescription && (
                    <div className="canvas-link-desc">{el.linkDescription}</div>
                  )}
                </div>
              </a>
            ) : (
              <textarea
                className="canvas-text"
                value={el.content ?? ''}
                readOnly={readOnly}
                onChange={(e) => updateEl(el.id, { content: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
              />
            )}
          </div>
        ))}
        {block.elements.length === 0 && (
          <div className="canvas-empty muted">
            点击画布选中 · Ctrl+V 粘贴文字/图片/链接 · 可将图片块拖入
          </div>
        )}
      </div>
    </div>
  );
}
