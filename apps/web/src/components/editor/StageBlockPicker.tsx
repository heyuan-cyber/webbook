import { useEffect } from 'react';
import type { BlockType } from '@webbook/shared';
import { StageInsertMenu } from './StageInsertMenu';
import type { WorldPoint } from './stageCoords';

interface Props {
  point: WorldPoint;
  onDismiss: () => void;
  onInsertType: (type: BlockType) => void;
}

/** 双击舞台空白时出现：仅块类型选择器，不预创建便签 */
export function StageBlockPicker({ point, onDismiss, onInsertType }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <div
      data-stage-block
      data-stage-interactive
      className="stage-block-picker"
      style={{ left: point.x, top: point.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <StageInsertMenu defaultOpen onInsert={onInsertType} />
    </div>
  );
}
