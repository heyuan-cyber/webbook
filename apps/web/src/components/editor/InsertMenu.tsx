import { useState } from 'react';
import type { BlockType } from '@webbook/shared';
import { BLOCK_MENU } from './blockFactory';

export function InsertMenu({ onInsert }: { onInsert: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="insert-menu">
      <button
        className="insert-trigger"
        title="在此插入块"
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      {open && (
        <div className="insert-popup" onMouseLeave={() => setOpen(false)}>
          {BLOCK_MENU.map((m) => (
            <button
              key={m.type}
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
