import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('webbook-install-dismissed') === '1',
  );
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (isStandalone || dismissed || !deferred) return null;

  return (
    <div className="install-banner" role="region" aria-label="安装应用">
      <span>将 WebBook 安装到主屏幕，获得全屏 App 体验</span>
      <div className="install-banner-actions">
        <button
          className="btn btn-primary"
          onClick={async () => {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === 'accepted') setDeferred(null);
          }}
        >
          安装
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            localStorage.setItem('webbook-install-dismissed', '1');
            setDismissed(true);
          }}
        >
          稍后
        </button>
      </div>
    </div>
  );
}
