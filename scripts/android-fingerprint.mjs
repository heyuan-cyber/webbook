#!/usr/bin/env node
/**
 * 从 android.keystore 提取 SHA256 指纹，更新 assetlinks.json。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keystore = resolve(root, 'apps/android-twa/android.keystore');
const assetlinks = resolve(root, 'apps/web/public/.well-known/assetlinks.json');

if (!existsSync(keystore)) {
  console.error('未找到 android.keystore，请先运行 npm run android:apk');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await new Promise((res) => {
  rl.question('输入 keystore 密码（Bubblewrap 首次 build 时设置的）: ', (ans) => {
    rl.close();
    res(ans);
  });
});

const out = spawnSync(
  'keytool',
  ['-list', '-v', '-keystore', keystore, '-alias', 'webbook', `-storepass`, password],
  { encoding: 'utf8' },
);

if (out.status !== 0) {
  console.error(out.stderr || 'keytool 失败，请确认 JAVA_HOME 已配置');
  process.exit(1);
}

const m = out.stdout.match(/SHA256:\s*([0-9A-F:]+)/i);
if (!m) {
  console.error('未解析到 SHA256 指纹');
  process.exit(1);
}

const fp = m[1].toUpperCase();
const json = JSON.parse(readFileSync(assetlinks, 'utf8'));
json[0].target.sha256_cert_fingerprints = [fp];
writeFileSync(assetlinks, JSON.stringify(json, null, 2) + '\n');
console.log(`✓ 已写入 ${assetlinks}`);
console.log(`  指纹: ${fp}`);
console.log('  请 git push 重新部署前端，TWA 全屏才会生效。');
