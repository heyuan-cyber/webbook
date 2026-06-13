#!/usr/bin/env node
/**
 * 从 android.keystore 提取 SHA256 指纹，更新 assetlinks.json。
 */
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const keystore = resolve(root, 'apps/android-twa/android.keystore');
const assetlinks = resolve(root, 'apps/web/public/.well-known/assetlinks.json');
const userPagesAssetlinks = resolve(root, 'user-pages/.well-known/assetlinks.json');

if (!existsSync(keystore)) {
  console.error('未找到 android.keystore，请先运行 npm run android:apk');
  process.exit(1);
}

const password = process.env.ANDROID_KEYSTORE_PASSWORD ?? 'webbook2026';
if (!process.env.ANDROID_KEYSTORE_PASSWORD) {
  console.log('使用默认 keystore 密码 webbook2026（首次 build 设置的密码）');
}

function resolveKeytool() {
  if (process.env.JAVA_HOME) {
    const p = resolve(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
    if (existsSync(p)) return p;
  }
  try {
    const out = execSync('java -XshowSettings:properties -version 2>&1', { encoding: 'utf8' });
    const m = out.match(/java\.home = (.+)/);
    if (m) {
      const p = resolve(m[1].trim(), 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
      if (existsSync(p)) return p;
    }
  } catch {
    /* ignore */
  }
  return 'keytool';
}

const keytool = resolveKeytool();
const out = spawnSync(
  keytool,
  ['-list', '-v', '-keystore', keystore, '-alias', 'android', `-storepass`, password],
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
mkdirSync(resolve(root, 'user-pages/.well-known'), { recursive: true });
writeFileSync(userPagesAssetlinks, JSON.stringify(json, null, 2) + '\n');
console.log(`✓ 已写入 ${assetlinks}`);
console.log(`✓ 已同步 ${userPagesAssetlinks}`);
console.log(`  指纹: ${fp}`);
console.log('  请 git push 部署前端，并运行 npm run deploy:user-pages 部署域名根 assetlinks。');
