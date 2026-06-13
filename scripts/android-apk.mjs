#!/usr/bin/env node
/**
 * 编译签名 APK（侧载安装，免费）。
 * 使用 Gradle 直接构建，避免 Bubblewrap 交互式密码。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const twaDir = resolve(root, 'apps/android-twa');

function detectJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  try {
    const out = execSync('java -XshowSettings:properties -version 2>&1', {
      encoding: 'utf8',
    });
    const m = out.match(/java\.home = (.+)/);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

if (!existsSync(resolve(twaDir, 'app'))) {
  console.error('请先运行: npm run android:init');
  process.exit(1);
}

const javaHome = detectJavaHome();
const bubblewrapSdk = `${process.env.USERPROFILE || process.env.HOME}/.bubblewrap/android_sdk`;
const androidHome =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (existsSync(bubblewrapSdk) ? bubblewrapSdk : `${process.env.LOCALAPPDATA}/Android/Sdk`);

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
console.log('构建 APK（Gradle）…');

const r = spawnSync(gradlew, ['assembleRelease'], {
  cwd: twaDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
    ANDROID_KEYSTORE_PASSWORD: process.env.ANDROID_KEYSTORE_PASSWORD ?? 'webbook2026',
  },
});

if (r.status !== 0) process.exit(r.status ?? 1);

const built = resolve(twaDir, 'app/build/outputs/apk/release/app-release.apk');
const out = resolve(twaDir, 'app-release-signed.apk');
if (!existsSync(built)) {
  console.error('未找到构建产物:', built);
  process.exit(1);
}
copyFileSync(built, out);
console.log(`\n✓ APK: apps/android-twa/app-release-signed.apk`);
console.log('  keystore 密码: webbook2026');
console.log('  下一步: npm run android:fingerprint → git push 部署 assetlinks');
