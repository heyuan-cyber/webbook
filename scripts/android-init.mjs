#!/usr/bin/env node
/**
 * 首次初始化 Bubblewrap Android 工程（仅运行一次）。
 * 需要 JDK 17+；Android SDK 可由 Bubblewrap 自动安装。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const twaDir = resolve(root, 'apps/android-twa');
const manifest =
  process.env.TWA_MANIFEST_URL ??
  'https://heyuan-cyber.github.io/webbook/manifest.webmanifest';

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

if (existsSync(resolve(twaDir, 'app'))) {
  console.log('Android 工程已存在，跳过 init。直接运行 npm run android:apk');
  process.exit(0);
}

const javaHome = detectJavaHome();
const bubblewrapSdk = `${process.env.USERPROFILE || process.env.HOME}/.bubblewrap/android_sdk`;
const androidHome =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (existsSync(bubblewrapSdk) ? bubblewrapSdk : `${process.env.LOCALAPPDATA}/Android/Sdk`);

console.log('初始化 Bubblewrap 工程…');
if (javaHome) console.log(`JAVA_HOME=${javaHome}`);

const child = spawn(
  'npx',
  ['@bubblewrap/cli@latest', 'init', '--manifest', manifest, '--directory', '.'],
  {
    cwd: twaDir,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
    env: {
      ...process.env,
      ...(javaHome ? { JAVA_HOME: javaHome } : {}),
      ANDROID_HOME: androidHome,
      ANDROID_SDK_ROOT: androidHome,
    },
  },
);

// file:// manifest 会直接进入配置确认，多按 Enter 接受 twa-manifest.json 默认值
const answers = Array(20).fill('');
let i = 0;
const pushAnswer = () => {
  if (i < answers.length) {
    child.stdin.write(`${answers[i++]}\n`);
    setTimeout(pushAnswer, 1500);
  } else {
    child.stdin.end();
  }
};
setTimeout(pushAnswer, 2000);

child.on('close', (code) => process.exit(code ?? 1));
