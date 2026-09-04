import type { BlockType } from '@webbook/shared';
import { filterBlockMenu } from './blockFactory';
import { motion, MOTION, useMotionSafe } from '@/lib/motion';

interface Props {
  filter: string;
  onPick: (type: BlockType) => void;
  onClose: () => void;
}

export function SlashMenu({ filter, onPick, onClose }: Props) {
  const reduced = useMotionSafe();
  const anim = reduced
    ? { duration: 0 }
    : MOTION.fast;
  const enter = reduced ? false : { opacity: 0, y: -4, scale: 0.98 };
  const items = filterBlockMenu(filter);

  if (items.length === 0) {
    return (
      <motion.div
        className="slash-menu"
        role="listbox"
        initial={enter}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={anim}
      >
        <p className="slash-empty muted">无匹配块类型</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="slash-menu"
      role="listbox"
      initial={enter}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={anim}
    >
      {items.map((m) => (
        <button
          key={m.type}
          type="button"
          className="slash-item"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(m.type);
          }}
        >
          <span className="slash-icon">{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
      <button type="button" className="slash-cancel muted" onMouseDown={(e) => {
        e.preventDefault();
        onClose();
      }}>
        Esc 取消
      </button>
    </motion.div>
  );
}
