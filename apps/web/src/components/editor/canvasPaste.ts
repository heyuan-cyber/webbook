import type { CanvasBlock, CanvasElement } from '@webbook/shared';
import { uid } from '@/lib/id';
import { apiClient } from '@/lib/api';
import { handleImageFile } from './imageUpload';

const URL_RE = /^https?:\/\/\S+$/i;

export function isPasteUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}

const COLORS = ['#fde68a', '#bae6fd', '#bbf7d0', '#fecaca', '#e9d5ff'];

function pickColor(index: number) {
  return COLORS[index % COLORS.length]!;
}

export function createStickyElement(text: string, x: number, y: number, index: number): CanvasElement {
  return {
    id: uid('el'),
    kind: 'sticky',
    x,
    y,
    width: 180,
    height: Math.min(200, 80 + text.split('\n').length * 18),
    content: text,
    color: pickColor(index),
  };
}

export function createImageElement(
  src: string,
  x: number,
  y: number,
  opts?: { width?: number; crop?: CanvasElement['imageCrop'] },
): CanvasElement {
  const w = opts?.width ?? 200;
  return {
    id: uid('el'),
    kind: 'image',
    x,
    y,
    width: w,
    height: Math.round(w * 0.75),
    content: src,
    imageCrop: opts?.crop,
  };
}

export function createLinkElement(url: string, x: number, y: number): CanvasElement {
  return {
    id: uid('el'),
    kind: 'link',
    x,
    y,
    width: 240,
    height: 88,
    linkUrl: url,
    linkTitle: url,
  };
}

export async function pasteIntoCanvas(
  data: DataTransfer,
  block: CanvasBlock,
  point: { x: number; y: number },
  session: { token: string } | null,
  isGuest: boolean,
): Promise<CanvasBlock | null> {
  const file = data.files?.[0];
  if (file?.type.startsWith('image/')) {
    const src = await handleImageFile(file, session, isGuest);
    const el = createImageElement(src, point.x, point.y);
    return { ...block, elements: [...block.elements, el] };
  }

  const text = data.getData('text/plain')?.trim();
  if (!text) return null;

  if (isPasteUrl(text)) {
    const el = createLinkElement(text, point.x, point.y);
    return { ...block, elements: [...block.elements, el] };
  }

  const el = createStickyElement(text, point.x, point.y, block.elements.length);
  return { ...block, elements: [...block.elements, el] };
}

export async function fetchLinkMetaForElement(
  url: string,
): Promise<Pick<CanvasElement, 'linkTitle' | 'linkDescription' | 'linkImage' | 'linkFavicon'>> {
  try {
    const meta = await apiClient.linkPreview(url);
    return {
      linkTitle: meta.title ?? url,
      linkDescription: meta.description,
      linkImage: meta.image,
      linkFavicon: meta.favicon,
    };
  } catch {
    return { linkTitle: url };
  }
}
