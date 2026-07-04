import type { Block } from '@webbook/shared';
import {
  buildOutline,
  headingHasSectionBody,
  type OutlineBlockRef,
  type OutlineSectionNode,
} from '@webbook/shared';

const BLOCK_ICONS: Partial<Record<Block['type'], string>> = {
  sticky: '📌',
  image: '🖼',
  video: '▶',
  canvas: '🎨',
  'link-preview': '🔗',
  paragraph: '¶',
  list: '•',
  checkbox: '☑',
  callout: '💡',
  divider: '―',
};

interface Props {
  blocks: Block[];
  collapsed: Record<string, boolean>;
  onToggleCollapse: (headingId: string) => void;
  onSelectBlock: (blockIndex: number) => void;
  readOnly?: boolean;
}

export function OutlinePanel({
  blocks,
  collapsed,
  onToggleCollapse,
  onSelectBlock,
  readOnly,
}: Props) {
  const doc = buildOutline(blocks);
  const hasContent = doc.preamble.length > 0 || doc.sections.length > 0;

  return (
    <aside className="outline-panel" aria-label="文档大纲">
      <div className="outline-panel-head">
        <span className="outline-panel-title">大纲</span>
      </div>
      <div className="outline-panel-body">
        {!hasContent && <p className="muted outline-empty">添加标题后显示结构</p>}
        {doc.preamble.map((item) => (
          <BlockRow key={item.blockId} blockRef={item} depth={0} onSelect={onSelectBlock} />
        ))}
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
  const hasBody = headingHasSectionBody(blocks, node.blockIndex);

  return (
    <div className="outline-section" style={{ paddingLeft: depth * 10 }}>
      <div className="outline-row outline-row-heading">
        {hasBody && !readOnly ? (
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
        node.children.map((entry) =>
          entry.kind === 'section' ? (
            <SectionTree
              key={entry.blockId}
              node={entry}
              depth={depth + 1}
              blocks={blocks}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              onSelectBlock={onSelectBlock}
              readOnly={readOnly}
            />
          ) : (
            <BlockRow
              key={entry.blockId}
              blockRef={entry}
              depth={depth + 1}
              onSelect={onSelectBlock}
            />
          ),
        )}
    </div>
  );
}

function BlockRow({
  blockRef,
  depth,
  onSelect,
}: {
  blockRef: OutlineBlockRef;
  depth: number;
  onSelect: (blockIndex: number) => void;
}) {
  const icon = BLOCK_ICONS[blockRef.type] ?? '▪';
  return (
    <div className="outline-row outline-row-block" style={{ paddingLeft: 8 + depth * 10 }}>
      <span className="outline-twisty leaf">·</span>
      <button type="button" className="outline-label" onClick={() => onSelect(blockRef.blockIndex)}>
        <span className="outline-block-icon">{icon}</span>
        {blockRef.label}
      </button>
    </div>
  );
}
