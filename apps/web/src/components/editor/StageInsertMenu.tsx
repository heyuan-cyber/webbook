import { useState } from 'react';
import type { BlockType } from '@webbook/shared';
import { BLOCK_MENU } from './blockFactory';

/** 双击舞台：完整块菜单（与文档插入一致；不含已废弃的 canvas） */
export function StageInsertMenu({
  onInsert,
  defaultOpen = false,
}: {
  onInsert: (type: BlockType) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="insert-menu stage-insert-menu">
      {!defaultOpen && (
        <button
          type="button"
          className="insert-trigger stage-insert-trigger"
          title="插入块"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen((v) => !v)}
        >
          +
        </button>
      )}
      {open && (
        <div
          className={`insert-popup stage-insert-popup ${defaultOpen ? 'stage-insert-popup-open' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseLeave={defaultOpen ? undefined : () => setOpen(false)}
        >
          {BLOCK_MENU.map((m) => (
            <button
              key={m.type}
              type="button"
              className="insert-item"
              onClick={() => {
                onInsert(m.type);
                setOpen(false);
              }}
            >
              <span className="insert-icon">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
