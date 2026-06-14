import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { isInstalledShell, purgeShellCaches } from './lib/shellContext';
import './styles/global.css';
import './styles/layout.css';

async function bootstrap() {
  if (isInstalledShell()) {
    await purgeShellCaches();
  } else if ('serviceWorker' in navigator) {
    registerSW({ immediate: true });
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
