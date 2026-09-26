import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * 按运行环境分组的全局变量声明。
 *
 * 这些分组不是可选的：本仓同时存在三种运行时，缺少任一组都会让 lint 报出成百上千条
 * 假的 `no-undef`（历史基线：803 errors / 89 files，其中 800 条是这一类）。
 *   - apps/web            → 浏览器（browser）
 *   - workers/api         → Cloudflare Workers 运行时（worker + serviceworker）
 *   - scripts / vite 配置 → Node（node）
 */
const runtimeGlobals = {
  browser: { ...globals.browser },
  worker: { ...globals.worker, ...globals.serviceworker },
  node: { ...globals.node, ...globals.nodeBuiltin },
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/build/**',
      '**/.gradle/**',
      'apps/android-twa/**',
      'apps/android-cap/android/**',
    ],
  },
  js.configs.recommended,

  /* ── 浏览器侧：前端与共用包（共用包被前端打包，按浏览器环境校验） ── */
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/shared/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      globals: runtimeGlobals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tseslint, 'react-hooks': reactHooks },
    rules: {
      // 类型检查（tsc --noEmit）已经覆盖未定义标识符，重复判定只会产生环境误报。
      // 这是 typescript-eslint 的官方建议做法。
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // 真正启用插件自带规则，使代码里既有的 eslint-disable react-hooks/* 注释有效
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  /* ── Worker 侧 ── */
  {
    files: ['workers/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      globals: runtimeGlobals.worker,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  /* ── Node 侧：构建脚本、部署脚本、根/vite 配置 ── */
  {
    files: ['scripts/**/*.{js,mjs,cjs}', '*.{js,mjs,cjs}'],
    languageOptions: {
      globals: runtimeGlobals.node,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
  },
  {
    // vite 配置在 Node 中执行，但同时接触浏览器构建期全局；必须放在浏览器分组之后以覆盖它
    files: ['apps/web/vite.config.ts'],
    languageOptions: {
      parser: tsparser,
      globals: { ...runtimeGlobals.node, ...runtimeGlobals.browser },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: { 'no-undef': 'off' },
  },
];
