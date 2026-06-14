import type { BlockType } from '@webbook/shared';
import { filterBlockMenu } from './blockFactory';

interface Props {
  filter: string;
  onPick: (type: BlockType) => void;
  onClose: () => void;
}

export function SlashMenu({ filter, onPick, onClose }: Props) {
  const items = filterBlockMenu(filter);
  if (items.length === 0) {
    return (
      <div className="slash-menu" role="listbox">
        <p className="slash-empty muted">无匹配块类型</p>
      </div>
    );
  }

  return (
    <div className="slash-menu" role="listbox">
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
    </div>
  );
}
