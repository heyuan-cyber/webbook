import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles/global.css';
import './styles/layout.css';

/** APK/TWA 壳启动时 referrer 为 android-app://<package> */
const isTwaShell = () => document.referrer.startsWith('android-app://');

// TWA 与 Chrome 共用配置；自带浏览器清缓存无效。TWA 内跳过 SW 避免旧缓存导致白屏。
if ('serviceWorker' in navigator && isTwaShell()) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    void Promise.all(regs.map((r) => r.unregister()));
  });
} else {
  registerSW({ immediate: true });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
