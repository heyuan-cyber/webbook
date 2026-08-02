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

/**
 * @param naturalAspect 原图像素宽/高。裁剪框的归一化 w/h 不是像素比；
 *   显示宽高比 = (crop.w / crop.h) * naturalAspect。未提供时不写 aspectRatio，
 *   避免全图 crop(1,1) 被误当成 1:1 正方形。
 */
export function cropFrameStyle(
  crop: ImageCrop,
  displayWidth?: number,
  naturalAspect?: number,
) {
  const c = normalizeCrop(crop);
  const style: {
    width: string;
    maxWidth: string;
    overflow: 'hidden';
    position: 'relative';
    aspectRatio?: string;
  } = {
    width: displayWidth ? `${displayWidth}px` : '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
  };
  if (naturalAspect && naturalAspect > 0) {
    const aspect = (c.width / c.height) * naturalAspect;
    style.aspectRatio = `${aspect} / 1`;
  }
  return style;
}

/** 舞台绝对图：外框尺寸已由 placement 决定，只需裁剪容器样式 */
export function stageCropFrameStyle(height: number) {
  return {
    width: '100%' as const,
    height,
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
