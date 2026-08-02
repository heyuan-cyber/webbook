import { assetUrl } from '@/lib/api';

/** 读取图片自然尺寸，并拟合到舞台默认最长边 */

export const STAGE_IMAGE_MAX_EDGE = 280;

export function fitStageImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxEdge = STAGE_IMAGE_MAX_EDGE,
): { width: number; height: number } {
  const nw = Math.max(1, naturalWidth);
  const nh = Math.max(1, naturalHeight);
  const scale = maxEdge / Math.max(nw, nh);
  return {
    width: Math.max(40, Math.round(nw * scale)),
    height: Math.max(40, Math.round(nh * scale)),
  };
}

function loadFromUrl(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth || 1,
        height: img.naturalHeight || 1,
      });
    img.onerror = () => reject(new Error('failed to load image size'));
    img.src = url;
  });
}

/** 从已解析的展示 URL / data URL 读自然尺寸 */
export function loadImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return loadFromUrl(assetUrl(src));
}

/** 上传前从本地 File 读尺寸（最稳，不依赖 API 可达性） */
export function loadImageNaturalSizeFromFile(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  return loadFromUrl(url).finally(() => URL.revokeObjectURL(url));
}

export async function stageImagePlacementSize(
  src: string,
): Promise<{ width: number; height: number }> {
  const { width, height } = await loadImageNaturalSize(src);
  return fitStageImageSize(width, height);
}

export async function stageImagePlacementSizeFromFile(
  file: File,
): Promise<{ width: number; height: number }> {
  const { width, height } = await loadImageNaturalSizeFromFile(file);
  return fitStageImageSize(width, height);
}
