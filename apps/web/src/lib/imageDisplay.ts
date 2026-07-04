import type { ImageCrop } from '@webbook/shared';

export const FULL_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };

export function normalizeCrop(crop?: ImageCrop): ImageCrop {
  if (!crop) return FULL_CROP;
  const x = Math.max(0, Math.min(1, crop.x));
  const y = Math.max(0, Math.min(1, crop.y));
  const width = Math.max(0.05, Math.min(1 - x, crop.width));
  const height = Math.max(0.05, Math.min(1 - y, crop.height));
  return { x, y, width, height };
}

export function cropFrameStyle(crop: ImageCrop, displayWidth?: number) {
  const c = normalizeCrop(crop);
  return {
    width: displayWidth ? `${displayWidth}px` : '100%',
    maxWidth: '100%',
    aspectRatio: `${c.width} / ${c.height}`,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  };
}

export function cropImageStyle(crop: ImageCrop) {
  const c = normalizeCrop(crop);
  return {
    position: 'absolute' as const,
    width: `${100 / c.width}%`,
    height: `${100 / c.height}%`,
    left: `${(-c.x / c.width) * 100}%`,
    top: `${(-c.y / c.height) * 100}%`,
    maxWidth: 'none',
  };
}
