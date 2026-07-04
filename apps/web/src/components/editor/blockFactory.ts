import type { Block, BlockPlacement, BlockType } from '@webbook/shared';
import { defaultStickyPlacement } from '@webbook/shared';
import { uid } from '@/lib/id';

export function createBlock(type: BlockType): Block {
  const id = uid('blk');
  switch (type) {
    case 'heading':
      return { id, type, level: 2, text: '' };
    case 'paragraph':
      return { id, type, text: '' };
    case 'list':
      return { id, type, ordered: false, items: [''] };
    case 'checkbox':
      return { id, type, checked: false, text: '' };
    case 'image':
      return { id, type, src: '', alt: '' };
    case 'video':
      return { id, type, src: '' };
    case 'link-preview':
      return { id, type, url: '' };
    case 'divider':
      return { id, type };
    case 'callout':
      return { id, type, tone: 'info', text: '' };
    case 'canvas':
      return { id, type, height: 320, elements: [] };
    case 'sticky':
      return {
        id,
        type: 'sticky',
        text: '',
        color: '#fde68a',
        placement: defaultStickyPlacement(),
      };
    default:
      return { id, type: 'paragraph', text: '' };
  }
}

export type StageAbsoluteType = 'sticky' | 'image' | 'link-preview';

export function createAbsoluteBlock(
  type: StageAbsoluteType,
  x: number,
  y: number,
): Block {
  const placement: BlockPlacement = {
    mode: 'absolute',
    x,
    y,
    z: 1,
    width: type === 'sticky' ? 200 : type === 'image' ? 280 : 260,
    height: type === 'sticky' ? 140 : type === 'image' ? 210 : undefined,
  };
  if (type === 'sticky') {
    const block = createBlock('sticky');
    if (block.type !== 'sticky') return block;
    return { ...block, placement, color: '#fde68a' };
  }
  if (type === 'image') {
    const block = createBlock('image');
    if (block.type !== 'image') return block;
    return { ...block, placement };
  }
  const block = createBlock('link-preview');
  if (block.type !== 'link-preview') return block;
  return { ...block, placement };
}

export const BLOCK_MENU: { type: BlockType; label: string; icon: string; slash?: string[] }[] = [
  { type: 'paragraph', label: '文本', icon: '¶', slash: ['文本', '段落', 'text', 'p'] },
  { type: 'heading', label: '标题', icon: 'H', slash: ['标题', 'heading', 'h1', 'h2', 'h3'] },
  { type: 'list', label: '列表', icon: '•', slash: ['列表', 'list', 'ul'] },
  { type: 'checkbox', label: '待办', icon: '☑', slash: ['待办', 'todo', 'checkbox', '任务'] },
  { type: 'image', label: '图片', icon: '🖼', slash: ['图片', 'image', 'img', '图'] },
  { type: 'video', label: '视频', icon: '▶', slash: ['视频', 'video'] },
  { type: 'link-preview', label: '链接预览', icon: '🔗', slash: ['链接', 'link', 'url'] },
  { type: 'callout', label: '标注', icon: '💡', slash: ['标注', 'callout', '提示'] },
  { type: 'sticky', label: '便签', icon: '📌', slash: ['便签', 'sticky', '贴纸'] },
  { type: 'canvas', label: '自由画布', icon: '🎨', slash: ['画布', 'canvas', '画板'] },
  { type: 'divider', label: '分割线', icon: '―', slash: ['分割', 'divider', 'hr'] },
];

export function filterBlockMenu(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return BLOCK_MENU;
  return BLOCK_MENU.filter(
    (m) =>
      m.label.toLowerCase().includes(q) ||
      m.type.includes(q) ||
      m.slash?.some((s) => s.toLowerCase().includes(q)),
  );
}
