import { useRef, useState } from 'react';
import type { CanvasBlock, CanvasElement, CanvasElementKind } from '@webbook/shared';
import { uid } from '@/lib/id';

interface Props {
  block: CanvasBlock;
  onChange: (block: CanvasBlock) => void;
  readOnly?: boolean;
}

const COLORS = ['#fde68a', '#bae6fd', '#bbf7d0', '#fecaca', '#e9d5ff'];

export function CanvasBlockView({ block, onChange, readOnly }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  function addElement(kind: CanvasElementKind) {
    const el: CanvasElement = {
      id: uid('el'),
      kind,
      x: 24 + block.elements.length * 16,
      y: 24 + block.elements.length * 16,
      width: kind === 'sticky' ? 160 : 200,
      height: kind === 'sticky' ? 120 : 60,
      content: kind === 'image' ? '' : '双击编辑',
      color: COLORS[block.elements.length % COLORS.length],
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
  }

  function onPointerDown(e: React.PointerEvent, el: CanvasElement) {
    if (readOnly) return;
    setSelected(el.id);
    const rect = ref.current!.getBoundingClientRect();
    drag.current = {
      id: el.id,
      dx: e.clientX - rect.left - el.x,
      dy: e.clientY - rect.top - el.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
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

  return (
    <div className="canvas-block">
      {!readOnly && (
        <div className="canvas-toolbar">
          <span className="muted">🎨 自由画布</span>
          <button className="btn btn-ghost" onClick={() => addElement('sticky')}>
            + 便签
          </button>
          <button className="btn btn-ghost" onClick={() => addElement('text')}>
            + 文本
          </button>
          <button className="btn btn-ghost" onClick={() => addElement('image')}>
            + 图片
          </button>
          {selected && (
            <button className="btn btn-ghost" onClick={() => removeEl(selected)}>
              删除选中
            </button>
          )}
        </div>
      )}
      <div
        ref={ref}
        className="canvas-surface"
        style={{ height: block.height }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {block.elements.map((el) => (
          <div
            key={el.id}
            className={`canvas-el ${selected === el.id ? 'selected' : ''}`}
            style={{
              left: el.x,
              top: el.y,
              width: el.width,
              height: el.height,
              background: el.kind === 'text' ? 'transparent' : el.color,
            }}
            onPointerDown={(e) => onPointerDown(e, el)}
          >
            {el.kind === 'image' ? (
              el.content ? (
                <img src={el.content} alt="" />
              ) : (
                <input
                  className="canvas-img-input"
                  placeholder="图片 URL"
                  onChange={(e) => updateEl(el.id, { content: e.target.value })}
                />
              )
            ) : (
              <textarea
                className="canvas-text"
                value={el.content ?? ''}
                readOnly={readOnly}
                onChange={(e) => updateEl(el.id, { content: e.target.value })}
              />
            )}
          </div>
        ))}
        {block.elements.length === 0 && (
          <div className="canvas-empty muted">空画布 — 用上方按钮添加元素，拖拽自由排布</div>
        )}
      </div>
    </div>
  );
}
