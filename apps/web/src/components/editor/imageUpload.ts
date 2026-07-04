import { apiClient } from '@/lib/api';

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** 剪贴板/拖拽图片 → 上传或 data URL */
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
