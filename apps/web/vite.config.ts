import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const base = process.env.VITE_BASE_PATH ?? '/';
const navigateFallback = `${base.replace(/\/?$/, '/')}index.html`;

export default defineConfig({
  // 从 monorepo 根目录加载 .env
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'WebBook 个人知识库',
        short_name: 'WebBook',
        description: '个人知识、项目记录与私密笔记',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: `${base}icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback,
        navigateFallbackDenylist: [/^\/api\//, /^https?:\/\/.*\.workers\.dev\//],
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.workers\.dev\/api\/public\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'webbook-api-public',
              expiration: { maxEntries: 32, maxAgeSeconds: 86_400 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /^https:\/\/.*\.workers\.dev\/api\/notes\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'webbook-api-notes',
              expiration: { maxEntries: 64, maxAgeSeconds: 604_800 },
              networkTimeoutSeconds: 8,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@webbook/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
