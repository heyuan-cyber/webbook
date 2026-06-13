#!/usr/bin/env node
/**
 * 编译签名 APK（侧载安装，免费）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const twaDir = resolve(root, 'apps/android-twa');

if (!existsSync(resolve(twaDir, 'app'))) {
  console.error('请先运行: npm run android:init');
  process.exit(1);
}

console.log('构建 APK…');
const r = spawnSync('npx', ['@bubblewrap/cli@latest', 'build'], {
  cwd: twaDir,
  stdio: 'inherit',
  shell: true,
});

if (r.status === 0) {
  console.log('\n✓ APK: apps/android-twa/app-release-signed.apk');
  console.log('  下一步: npm run android:fingerprint → 更新 assetlinks → 重新部署前端');
}
process.exit(r.status ?? 1);
