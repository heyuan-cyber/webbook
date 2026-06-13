import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // 从 monorepo 根目录加载 .env
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  // GitHub Pages 项目站点部署在 /<repo>/ 子路径；本地为 '/'
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
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
