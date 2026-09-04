import { useState } from 'react';
import type { BlockType } from '@webbook/shared';
import { BLOCK_MENU } from './blockFactory';
import { AnimatePresence, motion, MOTION, useMotionSafe } from '@/lib/motion';

export function InsertMenu({ onInsert }: { onInsert: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);
  const reduced = useMotionSafe();
  return (
    <div className="insert-menu">
      <button
        className="insert-trigger"
        title="在此插入块"
        onClick={() => setOpen((v) => !v)}
      >
        +
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="insert-popup"
            onMouseLeave={() => setOpen(false)}
            initial={reduced ? false : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, scale: 0.96, y: -4 }}
            transition={reduced ? { duration: 0 } : MOTION.fast}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
