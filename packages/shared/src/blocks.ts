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
  | 'canvas';

export interface BaseBlock {
  id: string;
  type: BlockType;
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

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string;
  alt?: string;
  caption?: string;
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

/** 画布内自由定位的元素 */
export type CanvasElementKind = 'sticky' | 'image' | 'text' | 'shape';

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
  | CanvasBlock;
