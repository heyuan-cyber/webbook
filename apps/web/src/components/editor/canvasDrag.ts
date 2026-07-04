import type { ImageCrop } from '@webbook/shared';

export const IMAGE_BLOCK_DRAG_TYPE = 'text/webbook-image-block';

export interface ImageBlockDragPayload {
  blockId: string;
  src: string;
  crop?: ImageCrop;
  width?: number;
}

export function parseImageBlockDrag(data: string): ImageBlockDragPayload | null {
  try {
    const p = JSON.parse(data) as ImageBlockDragPayload;
    if (p?.blockId && p?.src) return p;
  } catch {
    /* ignore */
  }
  return null;
}
