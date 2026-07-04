/** 笔记由有序的块组成；canvas 块内部是自由排版的元素集合。 */

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'checkbox'
  | 'image'
  | 'video'
  | 'link-preview'
  | 'divider'
  | 'callout'
  | 'canvas'
  | 'sticky';

/** flow=文档流脊；absolute=舞台覆层（仍占 blocks[] 顺序以定节归属） */
export interface BlockPlacement {
  mode: 'flow' | 'absolute';
  x?: number;
  y?: number;
  z?: number;
  width?: number;
  height?: number;
}

export interface BaseBlock {
  id: string;
  type: BlockType;
  placement?: BlockPlacement;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph';
  /** Markdown 内联文本 */
  text: string;
}

export interface ListBlock extends BaseBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface CheckboxBlock extends BaseBlock {
  type: 'checkbox';
  checked: boolean;
  text: string;
}

/** 相对原图 0–1 的裁剪区域 */
export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt?: string;
  caption?: string;
  /** 显示宽度（px），未设则 100% */
  width?: number;
  align?: 'left' | 'center' | 'right';
  crop?: ImageCrop;
  /** inline=文档流；free=块内自由定位 */
  layout?: 'inline' | 'free';
  freeX?: number;
  freeY?: number;
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  src: string;
  caption?: string;
}

export interface LinkPreviewBlock extends BaseBlock {
  type: 'link-preview';
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

export interface CalloutBlock extends BaseBlock {
  type: 'callout';
  tone: 'info' | 'warn' | 'success' | 'note';
  text: string;
}

export interface StickyBlock extends BaseBlock {
  type: 'sticky';
  text: string;
  color?: string;
}

/** 画布内自由定位的元素 */
export type CanvasElementKind = 'sticky' | 'image' | 'text' | 'shape' | 'link';

export interface CanvasElement {
  id: string;
  kind: CanvasElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  z?: number;
  /** sticky/text 的文本，image 的 src */
  content?: string;
  color?: string;
  /** image 元素裁剪（从 image block 迁入时可带） */
  imageCrop?: ImageCrop;
  /** link 预览卡 */
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkFavicon?: string;
}

export interface CanvasBlock extends BaseBlock {
  type: 'canvas';
  /** 画布区域高度（px），宽度自适应容器 */
  height: number;
  elements: CanvasElement[];
  /** 可选：未来嵌入 tldraw snapshot */
  snapshot?: unknown;
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | CheckboxBlock
  | ImageBlock
  | VideoBlock
  | LinkPreviewBlock
  | DividerBlock
  | CalloutBlock
  | StickyBlock
  | CanvasBlock;

/** 笔记舞台相机（固定视口，平移 viewCenter 浏览无限平面） */
export interface NoteStage {
  viewCenterX: number;
  viewCenterY: number;
}

export const DEFAULT_NOTE_STAGE: NoteStage = { viewCenterX: 0, viewCenterY: 0 };

export function isAbsoluteBlock(block: Block): boolean {
  return block.placement?.mode === 'absolute';
}

export function defaultStickyPlacement(offset = 0): BlockPlacement {
  return {
    mode: 'absolute',
    x: 32 + offset * 20,
    y: 32 + offset * 20,
    z: 1,
    width: 200,
    height: 140,
  };
}
