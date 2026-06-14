import type { Block, BlockType } from '@webbook/shared';
import { createBlock } from './blockFactory';

/** 块内文本以 `/` 开头且为单行时，视为 slash 命令输入 */
export function isSlashInput(text: string): boolean {
  return text.startsWith('/') && !text.includes('\n');
}

export function slashFilter(text: string): string {
  return text.startsWith('/') ? text.slice(1) : '';
}

/** 将当前块转换为另一类型（保留 id） */
export function convertBlock(block: Block, type: BlockType): Block {
  const base = createBlock(type);
  const id = block.id;
  switch (type) {
    case 'heading':
      return { ...base, id, type: 'heading', level: 2, text: '' };
    case 'paragraph':
      return { ...base, id, type: 'paragraph', text: '' };
    case 'list':
      return { ...base, id, type: 'list', ordered: false, items: [''] };
    case 'checkbox':
      return { ...base, id, type: 'checkbox', checked: false, text: '' };
    default:
      return { ...base, id } as Block;
  }
}

const IN_PLACE_TYPES: BlockType[] = ['paragraph', 'heading', 'list', 'checkbox'];

export function isInPlaceSlashType(type: BlockType): boolean {
  return IN_PLACE_TYPES.includes(type);
}
