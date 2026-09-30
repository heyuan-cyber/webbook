import type { CapacitorConfig } from '@capacitor/cli';

/**
 * WebBook Android 宿主的 Capacitor 配置。
 *
 * 设计依据：openspec/changes/native-android-companion/design.md 的 D1。
 *
 * ## 加载方式：打包进包（bundle），不用 server.url
 *
 * D1 原本选的是「远程加载现有站点」，理由是网页改动无需重新出包。
 * **该决策在 Phase 0 被推翻**，因为远程路径无法验证，而它的失败方式是隐蔽的：
 * `handleProxyRequest` 只在请求 `Accept` 头含 `text/html` 时才注入 bridge
 * （WebViewLocalServer.java:522-529），一旦不满足，页面照常渲染但
 * `window.Capacitor` 为 undefined —— 所有原生能力静默失效，看不出错。
 *
 * 而「打包进包」走的本地资产路径是**唯一实测通过的路径**：
 *   typeof window.Capacitor = object
 *   window.WEBVIEW_SERVER_URL = https://localhost
 *   typeof window.androidBridge = object
 *   Capacitor.getPlatform() = 'android'
 *   native.pluginReached = true          ← 插件调用真的到达原生
 *
 * 迁移成本经核实几乎为零：
 *   - 路由：App.tsx 的 basename 派生自 BASE_URL，打包后为 ''，BrowserRouter
 *     在根路径正常工作，现有代码零改动
 *   - API：publicDefaults.ts 里 API 与 Supabase 都是绝对 URL，从
 *     https://localhost/ 出发照常连通
 *   - CORS：Worker 是 Access-Control-Allow-Origin: *
 *
 * ## 代价（明确接受）
 *
 * 网页改动需要重新构建 APK 才能生效，不再有「改网页不用发版」。换来的是
 * 离线可用、启动更快、以及不依赖 GitHub Pages 可达性。
 *
 * ## 模式
 *
 * 通过 `WEBBOOK_CAP_MODE` 切换：
 *   （缺省）bundle —— 真机使用，加载 apps/web 的构建产物
 *   probe          —— Phase 0 诊断页，加载 apps/android-cap/www 的探针
 */
const MODE = process.env.WEBBOOK_CAP_MODE === 'probe' ? 'probe' : 'bundle';

const config: CapacitorConfig = {
  // 刻意不复用既有 TWA 的 io.github.heyuan_cyber.twa：
  // 两者包名与签名都不同，可并存安装、互不覆盖，便于回退。
  appId: 'io.github.heyuan_cyber.webbook',
  appName: MODE === 'probe' ? 'WebBook 探针' : 'WebBook',

  // bundle 模式直接吃 apps/web 的 Vite 构建产物（含 index.html 与 assets/）。
  // probe 模式吃 android-cap/www 下的探针页。
  webDir: MODE === 'probe' ? 'www' : '../web/dist',

  android: {
    // 允许 chrome://inspect 调试 WebView；需要收紧时改这里
    webContentsDebuggingEnabled: true,
  },
};

/*
 * 不设置 server 字段 —— 这是本配置最重要的约束。
 * 一旦设置 server.url，就会切到未验证的远程注入分支（见文件头说明）。
 * 若将来确实要改回远程加载，请先在真机上确认窗口内 window.Capacitor 非
 * undefined，再动这里。
 */

export default config;
