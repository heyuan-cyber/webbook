import type { Block, BlockEdge, BlockEdgeSide, BlockPlacement, NoteStage } from '@webbook/shared';
import { isAbsoluteBlock, sideAnchor } from '@webbook/shared';

export type LiveBlockGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 已折进 width/height 时用 1 */
  scale?: number;
};

interface WirePreview {
  fromId: string;
  fromSide: BlockEdgeSide;
  x: number;
  y: number;
}

interface Props {
  blocks: Block[];
  edges: BlockEdge[];
  stage: NoteStage;
  selectedEdgeId: string | null;
  wire: WirePreview | null;
  /** 拖/缩放中的临时几何，优先于 committed placement */
  livePlacements?: ReadonlyMap<string, LiveBlockGeometry>;
  onSelectEdge: (id: string | null) => void;
  onDeleteEdge?: (id: string) => void;
}

function placementOf(
  block: Block,
  live: ReadonlyMap<string, LiveBlockGeometry> | undefined,
): Pick<BlockPlacement, 'x' | 'y' | 'width' | 'height' | 'scale'> {
  const l = live?.get(block.id);
  if (l) {
    return {
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      scale: l.scale ?? 1,
    };
  }
  return (
    block.placement ?? {
      mode: 'absolute' as const,
      x: 0,
      y: 0,
      width: 200,
      height: 80,
    }
  );
}

function curvePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fromSide: BlockEdgeSide,
  toSide: BlockEdgeSide,
): string {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
  const dy = Math.max(40, Math.abs(y2 - y1) * 0.4);
  const c1 = offsetControl(x1, y1, fromSide, dx, dy);
  const c2 = offsetControl(x2, y2, toSide, dx, dy);
  return `M ${x1} ${y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${x2} ${y2}`;
}

function offsetControl(
  x: number,
  y: number,
  side: BlockEdgeSide,
  dx: number,
  dy: number,
): { x: number; y: number } {
  switch (side) {
    case 'n':
      return { x, y: y - dy };
    case 's':
      return { x, y: y + dy };
    case 'e':
      return { x: x + dx, y };
    case 'w':
      return { x: x - dx, y };
  }
}

export function StageEdgesLayer({
  blocks,
  edges,
  selectedEdgeId,
  wire,
  livePlacements,
  onSelectEdge,
  onDeleteEdge,
}: Props) {
  const byId = new Map(blocks.filter(isAbsoluteBlock).map((b) => [b.id, b]));

  return (
    <svg className="stage-edges-layer" aria-hidden>
      <defs>
        <marker
          id="stage-edge-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const a = sideAnchor(placementOf(from, livePlacements), edge.fromSide, edge.fromT);
        const b = sideAnchor(placementOf(to, livePlacements), edge.toSide, edge.toT);
        const d = curvePath(a.x, a.y, b.x, b.y, edge.fromSide, edge.toSide);
        const selected = selectedEdgeId === edge.id;

        function handleEdgePointer(e: React.PointerEvent) {
          e.stopPropagation();
          e.preventDefault();
          if (e.altKey && onDeleteEdge) {
            onDeleteEdge(edge.id);
            return;
          }
          onSelectEdge(edge.id);
        }

        function handleEdgeDblClick(e: React.MouseEvent) {
          e.stopPropagation();
          e.preventDefault();
          onDeleteEdge?.(edge.id);
        }

        return (
          <g key={edge.id}>
            <path
              className="stage-edge-hit"
              d={d}
              onPointerDown={handleEdgePointer}
              onDoubleClick={handleEdgeDblClick}
            />
            <path
              className={`stage-edge ${selected ? 'is-selected' : ''}`}
              d={d}
              markerEnd="url(#stage-edge-arrow)"
              onPointerDown={handleEdgePointer}
              onDoubleClick={handleEdgeDblClick}
            />
          </g>
        );
      })}
      {wire &&
        (() => {
          const from = byId.get(wire.fromId);
          if (!from) return null;
          const a = sideAnchor(placementOf(from, livePlacements), wire.fromSide);
          return (
            <path
              className="stage-edge stage-edge-preview"
              d={curvePath(a.x, a.y, wire.x, wire.y, wire.fromSide, 'w')}
              markerEnd="url(#stage-edge-arrow)"
            />
          );
        })()}
    </svg>
  );
}
