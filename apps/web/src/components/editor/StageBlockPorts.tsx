import type { BlockEdgeSide } from '@webbook/shared';

const SIDES: BlockEdgeSide[] = ['n', 'e', 's', 'w'];

interface Props {
  blockId: string;
  visible: boolean;
  onPortPointerDown: (side: BlockEdgeSide, e: React.PointerEvent) => void;
}

/** 四边连线锚点（选中或拉线时显示） */
export function StageBlockPorts({ blockId, visible, onPortPointerDown }: Props) {
  if (!visible) return null;
  return (
    <>
      {SIDES.map((side) => (
        <button
          key={side}
          type="button"
          className={`stage-port stage-port-${side}`}
          data-stage-port
          data-port-block={blockId}
          data-port-side={side}
          title="拖出连线"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPortPointerDown(side, e);
          }}
        />
      ))}
    </>
  );
}
