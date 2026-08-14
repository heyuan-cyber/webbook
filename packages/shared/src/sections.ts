import type { Block, BlockType, HeadingBlock } from './blocks.js';

/** 大纲中的非标题块引用（节归属由 blocks[] 位置决定：位于两 heading 之间即属该节） */
export interface OutlineBlockRef {
  kind: 'block';
  blockIndex: number;
  blockId: string;
  type: BlockType;
  label: string;
}

export interface OutlineSectionNode {
  kind: 'section';
  blockIndex: number;
  blockId: string;
  level: 1 | 2 | 3;
  text: string;
  children: OutlineEntry[];
}

export type OutlineEntry = OutlineBlockRef | OutlineSectionNode;

export interface OutlineDocument {
  /** 首个 heading 之前的块 */
  preamble: OutlineBlockRef[];
  sections: OutlineSectionNode[];
}

function isHeading(block: Block): block is HeadingBlock {
  return block.type === 'heading';
}

function blockLabel(block: Block): string {
  switch (block.type) {
    case 'heading':
      return block.text.trim() || '（无标题）';
    case 'paragraph':
    case 'callout':
      return block.text.trim().slice(0, 40) || '段落';
    case 'checkbox':
      return block.text.trim().slice(0, 40) || '待办';
    case 'list':
      return block.items[0]?.trim().slice(0, 40) || '列表';
    case 'sticky':
      return block.text.trim().slice(0, 40) || '便签';
    case 'image':
      return block.caption?.trim() || block.alt?.trim() || '图片';
    case 'video':
      return block.caption?.trim() || '视频';
    case 'model3d':
      return block.caption?.trim() || '3D 模型';
    case 'audio':
      return block.title?.trim() || block.caption?.trim() || '音频';
    case 'link-preview':
      return block.title?.trim() || block.url || '链接';
    case 'canvas':
      return '画布';
    case 'divider':
      return '分割线';
  }
}

/** 从 heading 索引起，节内容结束于下一个 level ≤ 当前 heading 的 heading（不含） */
export function sectionEndIndex(blocks: Block[], headingIndex: number): number {
  const head = blocks[headingIndex];
  if (!head || !isHeading(head)) return headingIndex + 1;
  for (let j = headingIndex + 1; j < blocks.length; j++) {
    const b = blocks[j];
    if (isHeading(b) && b.level <= head.level) return j;
  }
  return blocks.length;
}

export function headingHasSectionBody(blocks: Block[], headingIndex: number): boolean {
  return sectionEndIndex(blocks, headingIndex) > headingIndex + 1;
}

/** 块是否落在某个已折叠 heading 的节区间内（heading 自身始终可见） */
export function isBlockHiddenByCollapse(
  blocks: Block[],
  collapsedHeadingIds: ReadonlySet<string>,
  blockIndex: number,
): boolean {
  const block = blocks[blockIndex];
  if (!block || isHeading(block)) return false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!isHeading(b) || !collapsedHeadingIds.has(b.id)) continue;
    const end = sectionEndIndex(blocks, i);
    if (blockIndex > i && blockIndex < end) return true;
  }
  return false;
}

const STAGE_ORDER_EPS = 1;

/**
 * 按舞台视觉位置重排：flow 块保持相对顺序并排在前面；
 * absolute 块按 placement.y 再 x（稳定：原下标）。
 * 拖动 absolute 标题/卡片后调用，使大纲与折叠节区间与所见位置一致。
 */
export function reorderBlocksByStagePosition(blocks: Block[]): Block[] {
  const indexed = blocks.map((b, i) => ({ b, i }));
  indexed.sort((a, c) => {
    const aAbs = a.b.placement?.mode === 'absolute';
    const cAbs = c.b.placement?.mode === 'absolute';
    if (!aAbs && !cAbs) return a.i - c.i;
    if (!aAbs) return -1;
    if (!cAbs) return 1;
    const dy = (a.b.placement!.y ?? 0) - (c.b.placement!.y ?? 0);
    if (Math.abs(dy) > STAGE_ORDER_EPS) return dy;
    const dx = (a.b.placement!.x ?? 0) - (c.b.placement!.x ?? 0);
    if (Math.abs(dx) > STAGE_ORDER_EPS) return dx;
    return a.i - c.i;
  });
  const next = indexed.map(({ b }) => b);
  for (let i = 0; i < next.length; i++) {
    if (next[i]!.id !== blocks[i]!.id) return next;
  }
  return blocks;
}

/** 由 blocks[] 顺序构建大纲树；节归属不存字段，仅由索引区间推导 */
export function buildOutline(blocks: Block[]): OutlineDocument {
  const preamble: OutlineBlockRef[] = [];
  const sections: OutlineSectionNode[] = [];
  const stack: { level: number; node: OutlineSectionNode }[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (isHeading(b)) {
      const node: OutlineSectionNode = {
        kind: 'section',
        blockIndex: i,
        blockId: b.id,
        level: b.level,
        text: b.text.trim() || '（无标题）',
        children: [],
      };
      while (stack.length > 0 && stack[stack.length - 1]!.level >= b.level) {
        stack.pop();
      }
      if (stack.length === 0) sections.push(node);
      else stack[stack.length - 1]!.node.children.push(node);
      stack.push({ level: b.level, node });
      continue;
    }

    const ref: OutlineBlockRef = {
      kind: 'block',
      blockIndex: i,
      blockId: b.id,
      type: b.type,
      label: blockLabel(b),
    };
    if (stack.length === 0) preamble.push(ref);
    else stack[stack.length - 1]!.node.children.push(ref);
  }

  return { preamble, sections };
}
