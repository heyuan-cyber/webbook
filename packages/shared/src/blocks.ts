import type { BlockAiState } from './aiGenerate.js';

/** 笔记由有序的块组成；canvas 块内部是自由排版的元素集合。 */

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'checkbox'
  | 'image'
  | 'video'
  | 'model3d'
  | 'audio'
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
  /** 块自身显示缩放（相对默认尺寸），默认 1 */
  scale?: number;
  /**
   * 文本类 absolute 卡是否随内容自动调整宽高。
   * 未设置视为 true；用户手动缩放后应设为 false。
   */
  autoSize?: boolean;
}

/** 未显式关闭时，文本卡默认随内容自适应 */
export function isPlacementAutoSize(pl?: BlockPlacement | null): boolean {
  return pl?.autoSize !== false;
}

/** 自动长高：不封顶（盒随内容增高，不用盒内滚动） */
export const AUTO_SIZE_MAX_HEIGHT = Number.POSITIVE_INFINITY;

/** 自动拉宽上限（超出后折行；须 ≥ 新建默认段落宽） */
export const AUTO_SIZE_MAX_WIDTH = 1200;

export interface BaseBlock {
  id: string;
  type: BlockType;
  placement?: BlockPlacement;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
  ai?: BlockAiState;
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph';
  /** Markdown 内联文本 */
  text: string;
  ai?: BlockAiState;
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
  ai?: BlockAiState;
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  src: string;
  caption?: string;
  ai?: BlockAiState;
}

export interface Model3dBlock extends BaseBlock {
  type: 'model3d';
  /** GLB / 模型文件 */
  src: string;
  /** 舞台上的静态预览图 */
  poster?: string;
  caption?: string;
  ai?: BlockAiState;
}

export interface AudioBlock extends BaseBlock {
  type: 'audio';
  src: string;
  title?: string;
  caption?: string;
  ai?: BlockAiState;
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
  | Model3dBlock
  | AudioBlock
  | LinkPreviewBlock
  | DividerBlock
  | CalloutBlock
  | StickyBlock
  | CanvasBlock;

/** 笔记舞台相机（固定视口，平移 viewCenter / 缩放 viewScale 浏览无限平面） */
export interface NoteStage {
  viewCenterX: number;
  viewCenterY: number;
  /** 画布缩放，默认 1 */
  viewScale?: number;
}

export const DEFAULT_NOTE_STAGE: NoteStage = { viewCenterX: 0, viewCenterY: 0, viewScale: 1 };

export const STAGE_MIN_SCALE = 0.25;
/** 无上限（历史兼容导出） */
export const STAGE_MAX_SCALE = Number.POSITIVE_INFINITY;

export function clampStageScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return STAGE_MIN_SCALE;
  return Math.max(STAGE_MIN_SCALE, scale);
}

export function stageScale(stage: NoteStage): number {
  return clampStageScale(stage.viewScale ?? 1);
}

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

/** 有向边锚点：北/东/南/西 */
export type BlockEdgeSide = 'n' | 'e' | 's' | 'w';

/** 舞台块之间的有向连线 */
export interface BlockEdge {
  id: string;
  from: string;
  to: string;
  fromSide: BlockEdgeSide;
  toSide: BlockEdgeSide;
  /** 沿 from 边的位置 0..1，缺省 0.5（中点） */
  fromT?: number;
  /** 沿 to 边的位置 0..1，缺省 0.5 */
  toT?: number;
}

export function clampEdgeT(t: number | undefined): number {
  if (t === undefined || !Number.isFinite(t)) return 0.5;
  return Math.min(1, Math.max(0, t));
}

/** 量化后用于 edgeKey 去重（同边不同位置可共存） */
export function quantizeEdgeT(t: number | undefined, step = 0.01): number {
  const c = clampEdgeT(t);
  return Math.round(c / step) * step;
}

export function defaultCardSize(type: BlockType): { width: number; height: number } {
  switch (type) {
    case 'heading':
      // 源码态需容纳模式切换 + 格式工具栏
      return { width: 360, height: 120 };
    case 'paragraph':
      // 源码态需完整显示标题工具栏（含色点一行或折行）
      return { width: 380, height: 168 };
    case 'list':
    case 'checkbox':
      return { width: 280, height: 120 };
    case 'callout':
      return { width: 300, height: 120 };
    case 'sticky':
      return { width: 200, height: 140 };
    case 'image':
      return { width: 280, height: 210 };
    case 'link-preview':
      return { width: 260, height: 120 };
    case 'video':
      return { width: 320, height: 200 };
    case 'model3d':
      return { width: 280, height: 240 };
    case 'audio':
      return { width: 320, height: 100 };
    case 'divider':
      return { width: 240, height: 40 };
    default:
      return { width: 380, height: 168 };
  }
}

export function sideAnchor(
  pl: Pick<BlockPlacement, 'x' | 'y' | 'width' | 'height' | 'scale'>,
  side: BlockEdgeSide,
  t: number = 0.5,
): { x: number; y: number } {
  const x = pl.x ?? 0;
  const y = pl.y ?? 0;
  const scale = pl.scale ?? 1;
  const w = (pl.width ?? 200) * scale;
  const h = (pl.height ?? 80) * scale;
  const tt = clampEdgeT(t);
  switch (side) {
    case 'n':
      return { x: x + w * tt, y };
    case 's':
      return { x: x + w * tt, y: y + h };
    case 'e':
      return { x: x + w, y: y + h * tt };
    case 'w':
      return { x, y: y + h * tt };
  }
}

export type EdgeAttachment = {
  side: BlockEdgeSide;
  t: number;
  x: number;
  y: number;
  dist: number;
};

/** 世界坐标投影到轴对齐矩形最近边上 */
export function projectPointToBlockEdge(
  px: number,
  py: number,
  pl: Pick<BlockPlacement, 'x' | 'y' | 'width' | 'height' | 'scale'>,
): EdgeAttachment {
  const x0 = pl.x ?? 0;
  const y0 = pl.y ?? 0;
  const scale = pl.scale ?? 1;
  const w = Math.max(1, (pl.width ?? 200) * scale);
  const h = Math.max(1, (pl.height ?? 80) * scale);
  const x1 = x0 + w;
  const y1 = y0 + h;

  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

  const candidates: EdgeAttachment[] = [
    {
      side: 'n',
      t: (clamp(px, x0, x1) - x0) / w,
      x: clamp(px, x0, x1),
      y: y0,
      dist: Math.hypot(px - clamp(px, x0, x1), py - y0),
    },
    {
      side: 's',
      t: (clamp(px, x0, x1) - x0) / w,
      x: clamp(px, x0, x1),
      y: y1,
      dist: Math.hypot(px - clamp(px, x0, x1), py - y1),
    },
    {
      side: 'e',
      t: (clamp(py, y0, y1) - y0) / h,
      x: x1,
      y: clamp(py, y0, y1),
      dist: Math.hypot(px - x1, py - clamp(py, y0, y1)),
    },
    {
      side: 'w',
      t: (clamp(py, y0, y1) - y0) / h,
      x: x0,
      y: clamp(py, y0, y1),
      dist: Math.hypot(px - x0, py - clamp(py, y0, y1)),
    },
  ];

  let best = candidates[0]!;
  for (const c of candidates) {
    if (c.dist < best.dist) best = c;
  }
  return { ...best, t: clampEdgeT(best.t) };
}

export function edgeKey(
  e: Pick<BlockEdge, 'from' | 'to' | 'fromSide' | 'toSide' | 'fromT' | 'toT'>,
): string {
  const ft = quantizeEdgeT(e.fromT);
  const tt = quantizeEdgeT(e.toT);
  return `${e.from}:${e.fromSide}@${ft}->${e.to}:${e.toSide}@${tt}`;
}

export function oppositeSide(side: BlockEdgeSide): BlockEdgeSide {
  switch (side) {
    case 'n':
      return 's';
    case 's':
      return 'n';
    case 'e':
      return 'w';
    case 'w':
      return 'e';
  }
}
