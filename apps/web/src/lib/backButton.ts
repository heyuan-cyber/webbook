/**
 * Android 返回键 / 侧滑手势处理（native-android-companion）。
 *
 * ## 为什么需要它
 *
 * Capacitor 的默认行为是：**没有注册 `backButton` 监听器时，返回键直接退出应用**。
 * Android 上的侧边滑动就是"系统返回"的一种触发方式，因此未处理时表现为
 * "一滑就退出"——打开账单页后无法回到上一层，只能重新启动。
 *
 * ## 判定逻辑
 *
 * 事件自带 `canGoBack`（浏览器历史是否还能后退），这是可靠信号，不靠猜：
 *
 * ```
 * 返回键 / 侧滑
 *      │
 *      ├─ 在入口路由（/app、/blog、/admin…）
 *      │     └─ exitApp()            ← 用户预期"到底了，退出应用"
 *      │
 *      ├─ canGoBack === true
 *      │     └─ history.back()       ← 回退一层
 *      │
 *      └─ canGoBack === false（历史已到底）
 *            └─ exitApp()
 * ```
 *
 * **为什么要单独判入口路由**：若无条件 `history.back()`，用户永远退不出应用；
 * 若只信 `canGoBack`，打包版刚启动时历史里可能已有"初始化跳转"产生的一条记录，
 * 导致在首页按返回不退出而是回退到同一页。两者结合才是 Android 的标准手感。
 *
 * ## 浏览器中无副作用
 *
 * `Capacitor.isNativePlatform()` 为 false 时整个监听不注册——网页端浏览器有自己的
 * 返回按钮，接管它会破坏正常的浏览体验。
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * 入口路由：在这些路径上按返回应退出应用，而不是回退。
 *
 * 用精确匹配而非 `startsWith('/')`——后者会让所有路径都算入口。
 */
const ROOT_ROUTES = new Set([
  '/',
  '/app',
  '/blog',
  '/admin',
  '/login',
]);

/** 去掉尾斜杠，使 `/app/` 与 `/app` 等价 */
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export interface BackButtonHandle {
  dispose: () => void;
}

/**
 * 注册返回键处理。返回 `null` 表示当前不在宿主内（浏览器），未注册。
 *
 * 调用方应在应用根部调用一次并保存句柄，卸载时 `dispose()`。
 */
export async function installBackButtonHandler(): Promise<BackButtonHandle | null> {
  // 浏览器里不接管：网页端有自己的返回按钮与历史语义
  try {
    if (!Capacitor.isNativePlatform()) return null;
  } catch {
    return null;
  }

  try {
    const handle = await App.addListener('backButton', (event) => {
      // 用 try/catch 包住：返回键处理绝不能抛异常，
      // 否则用户按返回会导致应用崩溃——比"退不出去"严重得多。
      try {
        const path = normalize(window.location.pathname);

        if (ROOT_ROUTES.has(path)) {
          void App.exitApp();
          return;
        }

        // `canGoBack` 在部分平台/版本上可能缺失，缺失时按"能回退"处理：
        // 应用内路由跳转（navigate）本身就会压入历史，回退是安全默认。
        const canGoBack = event?.canGoBack ?? true;
        if (canGoBack) {
          window.history.back();
        } else {
          void App.exitApp();
        }
      } catch {
        void App.exitApp();
      }
    });

    return {
      dispose: () => {
        void handle.remove();
      },
    };
  } catch {
    // 插件不可用（例如未随包安装）时不应影响应用启动
    return null;
  }
}
