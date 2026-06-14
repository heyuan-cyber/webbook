/** APK / TWA / WebView / 已安装 PWA：不走 Service Worker，避免旧缓存壳。 */
export function isInstalledShell(): boolean {
  if (typeof window === 'undefined') return false;

  if (document.referrer.startsWith('android-app://')) return true;

  if (window.matchMedia('(display-mode: standalone)').matches) return true;

  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;

  if (new URLSearchParams(window.location.search).has('shell')) return true;

  // Android WebView 回退（TWA 无 Chrome 时）
  const ua = navigator.userAgent;
  if (/Android/i.test(ua) && /\bwv\b|; wv\)/.test(ua)) return true;

  return false;
}

export async function purgeShellCaches(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}
