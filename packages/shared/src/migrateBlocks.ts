import type { Block, ParagraphBlock } from './blocks.js';

/** 已废除的内容块 → paragraph（Markdown 承载列表/待办/标注） */
export function migrateRetiredContentBlocks(blocks: Block[]): Block[] {
  return blocks.map((b): Block => {
    if (b.type === 'list') {
      const text = b.items
        .map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`))
        .join('\n');
      const next: ParagraphBlock = {
        id: b.id,
        type: 'paragraph',
        text,
        placement: b.placement,
      };
      return next;
    }
    if (b.type === 'checkbox') {
      const next: ParagraphBlock = {
        id: b.id,
        type: 'paragraph',
        text: `- [${b.checked ? 'x' : ' '}] ${b.text}`,
        placement: b.placement,
      };
      return next;
    }
    if (b.type === 'callout') {
      const text = b.text
        ? b.text
            .split('\n')
            .map((l) => `> ${l}`)
            .join('\n')
        : '> ';
      const next: ParagraphBlock = {
        id: b.id,
        type: 'paragraph',
        text,
        placement: b.placement,
      };
      return next;
    }
    return b;
  });
}
