import type { Block } from '@webbook/shared';
import {
  buildOutline,
  headingHasSectionBody,
  type OutlineSectionNode,
} from '@webbook/shared';

interface Props {
  blocks: Block[];
  collapsed: Record<string, boolean>;
  onToggleCollapse: (headingId: string) => void;
  onSelectBlock: (blockIndex: number) => void;
  readOnly?: boolean;
  panelCollapsed?: boolean;
  onTogglePanel?: () => void;
}

function sectionChildren(node: OutlineSectionNode): OutlineSectionNode[] {
  return node.children.filter((e): e is OutlineSectionNode => e.kind === 'section');
}

export function OutlinePanel({
  blocks,
  collapsed,
  onToggleCollapse,
  onSelectBlock,
  readOnly,
  panelCollapsed,
  onTogglePanel,
}: Props) {
  const doc = buildOutline(blocks);
  const hasContent = doc.sections.length > 0;

  if (panelCollapsed) {
    return (
      <button
        type="button"
        className="outline-panel-rail"
        aria-label="展开大纲"
        title="展开大纲"
        onClick={onTogglePanel}
      >
        <span className="outline-panel-rail-label">大纲</span>
      </button>
    );
  }

  return (
    <aside className="outline-panel" aria-label="文档大纲">
      <div className="outline-panel-head">
        <span className="outline-panel-title">大纲</span>
        {onTogglePanel && (
          <button
            type="button"
            className="btn btn-ghost btn-sm outline-panel-toggle"
            aria-label="收起大纲"
            title="收起大纲"
            onClick={onTogglePanel}
          >
            «
          </button>
        )}
      </div>
      <div className="outline-panel-body">
        {!hasContent && <p className="muted outline-empty">添加标题后显示目录</p>}
        {doc.sections.map((node) => (
          <SectionTree
            key={node.blockId}
            node={node}
            depth={0}
            blocks={blocks}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            onSelectBlock={onSelectBlock}
            readOnly={readOnly}
          />
        ))}
      </div>
    </aside>
  );
}

function SectionTree({
  node,
  depth,
  blocks,
  collapsed,
  onToggleCollapse,
  onSelectBlock,
  readOnly,
}: {
  node: OutlineSectionNode;
  depth: number;
  blocks: Block[];
  collapsed: Record<string, boolean>;
  onToggleCollapse: (headingId: string) => void;
  onSelectBlock: (blockIndex: number) => void;
  readOnly?: boolean;
}) {
  const isCollapsed = collapsed[node.blockId] ?? false;
  const nested = sectionChildren(node);
  const hasBody = headingHasSectionBody(blocks, node.blockIndex);
  const showTwisty = hasBody || nested.length > 0;

  return (
    <div className="outline-section" style={{ paddingLeft: depth * 10 }}>
      <div className="outline-row outline-row-heading">
        {showTwisty && !readOnly ? (
          <button
            type="button"
            className="outline-twisty"
            aria-expanded={!isCollapsed}
            onClick={() => onToggleCollapse(node.blockId)}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="outline-twisty leaf">·</span>
        )}
        <button
          type="button"
          className="outline-label"
          onClick={() => onSelectBlock(node.blockIndex)}
        >
          <span className="outline-h-level">H{node.level}</span>
          {node.text}
        </button>
      </div>
      {!isCollapsed &&
        nested.map((child) => (
          <SectionTree
            key={child.blockId}
            node={child}
            depth={depth + 1}
            blocks={blocks}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            onSelectBlock={onSelectBlock}
            readOnly={readOnly}
          />
        ))}
    </div>
  );
}
