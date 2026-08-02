import type { Block, BlockType } from '@webbook/shared';
import { createBlock } from './blockFactory';

/** 块内文本以 `/` 开头且为单行时，视为 slash 命令输入 */
export function isSlashInput(text: string): boolean {
  return text.startsWith('/') && !text.includes('\n');
}

export function slashFilter(text: string): string {
  return text.startsWith('/') ? text.slice(1) : '';
}

/** `/h1` `/h2` `/h3` → 对应级别；其它标题查询默认 H2 */
export function headingLevelFromSlashQuery(query: string): 1 | 2 | 3 {
  const q = query.trim().toLowerCase();
  if (q === 'h1' || q === '1') return 1;
  if (q === 'h3' || q === '3') return 3;
  return 2;
}

/** 将当前块转换为另一类型（保留 id） */
export function convertBlock(
  block: Block,
  type: BlockType,
  opts?: { headingLevel?: 1 | 2 | 3 },
): Block {
  const base = createBlock(type);
  const id = block.id;
  switch (type) {
    case 'heading':
      return {
        ...base,
        id,
        type: 'heading',
        level: opts?.headingLevel ?? 2,
        text: '',
      };
    case 'paragraph':
    case 'list':
    case 'checkbox':
    case 'callout':
      return { ...base, id, type: 'paragraph', text: base.type === 'paragraph' ? base.text : '' };
    default:
      return { ...base, id } as Block;
  }
}

const IN_PLACE_TYPES: BlockType[] = ['paragraph', 'heading'];

export function isInPlaceSlashType(type: BlockType): boolean {
  return IN_PLACE_TYPES.includes(type);
}
