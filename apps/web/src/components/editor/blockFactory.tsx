import type { ReactNode } from 'react';
import type { Block, BlockPlacement, BlockType } from '@webbook/shared';
import { defaultCardSize, defaultStickyPlacement } from '@webbook/shared';
import { uid } from '@/lib/id';
import { Icon } from '@/components/Icon';

/** 已废除类型：落到带 Markdown 种子的段落 */
const RETIRED_SEED: Partial<Record<BlockType, string>> = {
  list: '- ',
  checkbox: '- [ ] ',
  callout: '> ',
};

export function createBlock(type: BlockType): Block {
  const id = uid('blk');
  const retired = RETIRED_SEED[type];
  if (retired !== undefined) {
    return { id, type: 'paragraph', text: retired };
  }
  switch (type) {
    case 'heading':
      return { id, type, level: 2, text: '' };
    case 'paragraph':
      return { id, type, text: '' };
    case 'image':
      return { id, type, src: '', alt: '' };
    case 'video':
      return { id, type, src: '' };
    case 'model3d':
      return { id, type, src: '' };
    case 'audio':
      return { id, type, src: '' };
    case 'link-preview':
      return { id, type, url: '' };
    case 'divider':
      return { id, type };
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

/** @deprecated 使用 createAbsoluteBlock；保留类型别名供旧引用 */
export type StageAbsoluteType = BlockType;

export function createAbsoluteBlock(type: BlockType, x: number, y: number): Block {
  const block = createBlock(type === 'canvas' ? 'paragraph' : type);
  const size = defaultCardSize(block.type);
  const placement: BlockPlacement = {
    mode: 'absolute',
    x,
    y,
    z: 1,
    width: size.width,
    height: size.height,
  };
  return { ...block, placement };
}

/**
 * 可插入块菜单（列表/待办/标注已废除，用段落 Markdown）
 *
 * `icon` 由 emoji / 字符（¶ H 🖼 ▶ 立方 ♪ 🔗 📌 ―）改为真正的图标组件：
 * emoji 会随 font-size 被动缩放、无法跟随主题色，且三端字形不一致。
 */
export interface BlockMenuItem {
  type: BlockType;
  label: string;
  icon: ReactNode;
  slash?: string[];
}

export const BLOCK_MENU: BlockMenuItem[] = [
  { type: 'paragraph', label: '文本', icon: <Icon name="type" size={16} />, slash: ['文本', '段落', 'text', 'p', '列表', 'list', '待办', 'todo', '标注', 'callout'] },
  { type: 'heading', label: '标题', icon: <Icon name="hash" size={16} />, slash: ['标题', 'heading', 'h1', 'h2', 'h3'] },
  { type: 'image', label: '图片', icon: <Icon name="image" size={16} />, slash: ['图片', 'image', 'img', '图'] },
  { type: 'video', label: '视频', icon: <Icon name="play" size={16} />, slash: ['视频', 'video'] },
  { type: 'model3d', label: '3D 模型', icon: <Icon name="box" size={16} />, slash: ['3d', '模型', 'model'] },
  { type: 'audio', label: '音频', icon: <Icon name="volume" size={16} />, slash: ['音频', '音乐', 'audio', 'music'] },
  { type: 'link-preview', label: '链接预览', icon: <Icon name="link" size={16} />, slash: ['链接', 'link', 'url'] },
  { type: 'sticky', label: '便签', icon: <Icon name="pin" size={16} />, slash: ['便签', 'sticky', '贴纸'] },
  { type: 'divider', label: '分割线', icon: <Icon name="minus" size={16} />, slash: ['分割', 'divider', 'hr'] },
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
