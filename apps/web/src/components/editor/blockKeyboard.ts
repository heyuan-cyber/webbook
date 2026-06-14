import type { KeyboardEvent } from 'react';
import type { Block, BlockType } from '@webbook/shared';
import { isSlashInput } from './slashCommand';

export function isEditableBlock(block: Block): boolean {
  return (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'checkbox' ||
    block.type === 'list'
  );
}

export function isEmptyBlock(block: Block): boolean {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'checkbox':
    case 'callout':
      return !block.text.trim();
    case 'list':
      return block.items.length === 0 || block.items.every((i) => !i.trim());
    default:
      return false;
  }
}

interface NavCtx {
  index: number;
  block: Block;
  blocks: Block[];
  el: HTMLInputElement | HTMLTextAreaElement;
  onInsertAfter: (index: number, type?: BlockType) => void;
  onRemoveAt: (index: number) => void;
  onFocusAt: (index: number) => void;
}

export function handleBlockKeyDown(e: KeyboardEvent, ctx: NavCtx) {
  const { index, block, blocks, el } = ctx;

  if (e.key === 'Enter' && e.shiftKey) {
    if (block.type === 'paragraph' && isSlashInput(block.text)) return;
    e.preventDefault();
    ctx.onInsertAfter(index, 'paragraph');
    return;
  }

  // Enter（无 Shift）：段落/列表默认换行；标题/待办为单行 input

  if (e.key === 'Escape' && block.type === 'paragraph' && isSlashInput(block.text)) {
    return;
  }

  if (e.key === 'Backspace' && isEmptyBlock(block)) {
    e.preventDefault();
    if (blocks.length <= 1) return;
    ctx.onRemoveAt(index);
    return;
  }

  if (e.key === 'ArrowUp') {
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    if (atStart && index > 0) {
      e.preventDefault();
      ctx.onFocusAt(index - 1);
    }
  }

  if (e.key === 'ArrowDown') {
    const atEnd =
      el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (atEnd && index < blocks.length - 1) {
      e.preventDefault();
      ctx.onFocusAt(index + 1);
    }
  }
}
