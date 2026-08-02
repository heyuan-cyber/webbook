import { useEffect } from 'react';
import type { BlockType } from '@webbook/shared';
import { StageInsertMenu } from './StageInsertMenu';

interface Props {
  onDismiss: () => void;
  onInsertType: (type: BlockType) => void;
}

/** 双击舞台空白时出现：仅块类型选择器；定位由 StageViewport HUD 层负责 */
export function StageBlockPicker({ onDismiss, onInsertType }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <div
      data-stage-interactive
      className="stage-block-picker"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <StageInsertMenu defaultOpen onInsert={onInsertType} />
    </div>
  );
}
