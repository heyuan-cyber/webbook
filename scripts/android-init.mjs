#!/usr/bin/env node
/**
 * 首次初始化 Bubblewrap Android 工程（仅运行一次）。
 * 需要已安装 JDK 17+ 和 Android SDK。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const twaDir = resolve(root, 'apps/android-twa');
const manifest = resolve(twaDir, 'twa-manifest.json');

if (existsSync(resolve(twaDir, 'app'))) {
  console.log('Android 工程已存在，跳过 init。直接运行 npm run android:apk');
  process.exit(0);
}

console.log('初始化 Bubblewrap 工程…');
const r = spawnSync(
  'npx',
  ['@bubblewrap/cli@latest', 'init', '--manifest', manifest, '--directory', '.'],
  { cwd: twaDir, stdio: 'inherit', shell: true },
);
process.exit(r.status ?? 1);
