#!/usr/bin/env node
/**
 * 构建 WebBook Android 宿主（Capacitor）APK。
 *
 * 用法：
 *   node scripts/android-cap-apk.mjs                    # bundle：打包 apps/web 构建产物（真机使用）
 *   node scripts/android-cap-apk.mjs --probe            # probe：本地 Phase 0 诊断页
 *   node scripts/android-cap-apk.mjs --release          # 出 release 包（需签名配置）
 *   node scripts/android-cap-apk.mjs --skip-web-build   # 跳过 apps/web 构建（复用已有 dist）
 *
 * 对应 openspec/changes/native-android-companion 的 tasks 2.1 / 2.3 / 2.9。
 *
 * 加载方式为「打包进包」，不用 server.url —— 理由见 apps/android-cap/capacitor.config.ts
 * 与 design.md 的 D1（远程注入分支未经验证，且失败时静默）。
 *
 * 与既有 `npm run android:apk`（TWA）刻意分开：两者包名、签名、输出路径都不同，
 * 可以并存安装，互不覆盖，便于回退。
 */
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const capDir = resolve(root, 'apps/android-cap');
const androidDir = resolve(capDir, 'android');
const webDist = resolve(root, 'apps/web/dist');

const args = process.argv.slice(2);
const isProbe = args.includes('--probe');
const isRelease = args.includes('--release');
const skipWebBuild = args.includes('--skip-web-build');

/** 传给 Capacitor 的模式名 */
const mode = isProbe ? 'probe' : 'bundle';
/** 产物文件名里的模式后缀 */
const modeSuffix = isProbe ? '-probe' : '';
/** 人类可读说明 */
const modeDesc = isProbe
  ? 'probe（Phase 0 诊断页）'
  : 'bundle（打包 apps/web 构建产物）';

const variant = isRelease ? 'Release' : 'Debug';
const variantLower = variant.toLowerCase();

if (!existsSync(androidDir)) {
  console.error('未找到 Android 工程，请先在 apps/android-cap 下执行: npx cap add android');
  process.exit(1);
}

/* ── 1. bundle 模式需要 apps/web 的构建产物 ── */
if (!isProbe) {
  const needBuild = !skipWebBuild || !existsSync(join(webDist, 'index.html'));
  if (needBuild) {
    console.log('· 构建 apps/web（bundle 模式需要 dist 产物）…');
    const b = spawnSync('npm', ['run', 'build'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (b.status !== 0) {
      console.error('apps/web 构建失败，无法打包宿主');
      process.exit(b.status ?? 1);
    }
  } else {
    console.log('· 跳过 apps/web 构建（--skip-web-build，复用已有 dist）');
  }
  if (!existsSync(join(webDist, 'index.html'))) {
    console.error(`未找到构建产物入口: ${join(webDist, 'index.html')}`);
    process.exit(1);
  }
}

/* ── 2. 探针模式下先生成探针页面 ── */
if (isProbe) {
  console.log('· 生成 Phase 0 探针页面…');
  const r = spawnSync(process.execPath, [resolve(capDir, 'scripts/build-probe.mjs')], {
    cwd: capDir,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/* ── 2. cap copy：把 www 资产与 capacitor.config.json 同步进 Android 工程 ── */
console.log(`· cap copy（模式：${modeDesc}）…`);
const capBin = resolve(capDir, 'node_modules/.bin', process.platform === 'win32' ? 'cap.cmd' : 'cap');
const copy = spawnSync(capBin, ['copy', 'android'], {
  // 必须在 android-cap 目录下执行，否则 Capacitor 找不到 android 平台
  cwd: capDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, WEBBOOK_CAP_MODE: mode },
});
if (copy.status !== 0) process.exit(copy.status ?? 1);

/* ── 3. 定位 Java 与 Android SDK ── */
function detectJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  try {
    const out = execSync('java -XshowSettings:properties -version 2>&1', { encoding: 'utf8' });
    const m = out.match(/java\.home = (.+)/);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

const javaHome = detectJavaHome();
const bubblewrapSdk = join(process.env.USERPROFILE || process.env.HOME || '', '.bubblewrap/android_sdk');
const localSdk = join(process.env.LOCALAPPDATA || '', 'Android/Sdk');
const androidHome =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (existsSync(localSdk) ? localSdk : bubblewrapSdk);

if (!existsSync(androidHome)) {
  console.error(`未找到 Android SDK: ${androidHome}`);
  console.error('请设置 ANDROID_HOME 或安装 Android Studio');
  process.exit(1);
}

/* ── 4. Gradle 构建 ── */
console.log(`· Gradle assemble${variant}（SDK: ${androidHome}）…`);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const gradle = spawnSync(gradlew, [`assemble${variant}`, '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    ANDROID_HOME: androidHome,
    ANDROID_SDK_ROOT: androidHome,
  },
});
if (gradle.status !== 0) process.exit(gradle.status ?? 1);

/* ── 5. 汇总产物 ── */
const apkName = `app-${variantLower}.apk`;
const built = resolve(androidDir, `app/build/outputs/apk/${variantLower}/${apkName}`);
if (!existsSync(built)) {
  console.error(`未找到构建产物: ${built}`);
  process.exit(1);
}

const outDir = resolve(capDir, 'dist');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, `webbook-host${modeSuffix}-${variantLower}.apk`);
copyFileSync(built, out);

console.log(`\n✓ APK: ${out.replace(root + '\\', '')}`);
console.log(`  包名: io.github.heyuan_cyber.webbook`);
console.log(`  模式: ${modeDesc}`);
console.log(`  变体: ${variant}`);
if (!isRelease) {
  console.log('  注意: debug 包用 Android 默认调试签名，与既有 TWA 包名不同，可并存安装');
}
