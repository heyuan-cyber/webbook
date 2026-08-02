import { apiClient } from '@/lib/api';

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function isTransientImageSrc(src: string): boolean {
  return src.startsWith('blob:');
}

export function createLocalImagePreview(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeLocalImagePreview(src: string): void {
  if (isTransientImageSrc(src)) URL.revokeObjectURL(src);
}

/** 剪贴板/拖拽图片 → 上传或 data URL（阻塞至完成后返回，无预览） */
export async function handleImageFile(
  file: File,
  session: { token: string } | null,
  isGuest: boolean,
): Promise<string> {
  if (isGuest || !session?.token) {
    return readAsDataUrl(file);
  }
  const { url } = await apiClient.uploadAsset(file, session.token);
  return url;
}

/**
 * 立刻给出本地 blob 预览，后台再换成可持久化 URL。
 * 调用方应在 finalize 成功后 revoke previewSrc。
 */
export function beginOptimisticImageUpload(
  file: File,
  session: { token: string } | null,
  isGuest: boolean,
): { previewSrc: string; finalize: () => Promise<string> } {
  const previewSrc = createLocalImagePreview(file);
  const finalize = () => handleImageFile(file, session, isGuest);
  return { previewSrc, finalize };
}
