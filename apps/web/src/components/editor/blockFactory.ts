import type { Block, BlockType } from '@webbook/shared';
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
    default:
      return { id, type: 'paragraph', text: '' };
  }
}

export const BLOCK_MENU: { type: BlockType; label: string; icon: string }[] = [
  { type: 'paragraph', label: '文本', icon: '¶' },
  { type: 'heading', label: '标题', icon: 'H' },
  { type: 'list', label: '列表', icon: '•' },
  { type: 'checkbox', label: '待办', icon: '☑' },
  { type: 'image', label: '图片', icon: '🖼' },
  { type: 'video', label: '视频', icon: '▶' },
  { type: 'link-preview', label: '链接预览', icon: '🔗' },
  { type: 'callout', label: '标注', icon: '💡' },
  { type: 'canvas', label: '自由画布', icon: '🎨' },
  { type: 'divider', label: '分割线', icon: '―' },
];
