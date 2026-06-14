# WebBook Android APK（TWA 侧载，全免费）

用 [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 把已部署的网站包成 Android APK，**无需 Google Play 开发者账号**。

## 前置条件（一次性）

1. **JDK 17+** — [Adoptium](https://adoptium.net/) 免费下载
2. **Android SDK** — 安装 [Android Studio](https://developer.android.com/studio) 后，SDK Manager 勾选 Build-Tools
3. 环境变量（PowerShell 示例）：

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17..."
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH += ";$env:ANDROID_HOME\platform-tools"
```

## 首次打包

在 `WebBook` 根目录：

```powershell
npm run android:init    # 根据 twa-manifest.json 生成 Android 工程（仅首次）
npm run android:apk     # 编译签名 APK
```

输出：`apps/android-twa/app-release-signed.apk`

安装到手机：传到手机 → 允许「未知来源」→ 点击安装。

## 全屏 Trusted Web Activity

APK 要**无浏览器地址栏**全屏打开，需配置 **Digital Asset Links**（两处）：

| 位置 | URL | 说明 |
|------|-----|------|
| 项目子路径（PWA） | `https://heyuan-cyber.github.io/webbook/.well-known/assetlinks.json` | 已随前端部署 |
| **域名根（TWA 验证）** | `https://heyuan-cyber.github.io/.well-known/assetlinks.json` | Android 按域名根查找，需单独配置 |

域名根文件由 `npm run deploy:user-pages` 自动部署到 **`heyuan-cyber/heyuan-cyber.github.io`** 用户主页仓（与 `webbook` 项目仓并存）。

```powershell
npm run android:fingerprint   # 更新指纹（同步 web + user-pages）
npm run deploy:user-pages       # 推送到用户主页仓并启用 Pages
git push                        # 部署 /webbook/.well-known/ 副本
```

验证：`https://heyuan-cyber.github.io/.well-known/assetlinks.json` 返回 JSON。

## 开屏卡在图标？

**清「自带浏览器」缓存无效**——APK 用的是 **Chrome** 或 **Android System WebView**，与小米/华为自带浏览器无关。

1. 清 **Google Chrome**（推荐先安装）→ 设置 → 网站设置 → `heyuan-cyber.github.io` → 清除并重置  
   或清 **Android System WebView**（设置 → 应用 → 显示系统应用）
2. 卸载 APK → 等 3 分钟 → 安装最新 `app-release-signed.apk`（versionCode ≥ 4）
3. **先开 APK** 安装后测试；若仍见旧版，卸载后重装最新 APK（versionCode ≥ 6）
4. APK 启动 URL 带 `?shell=twa`，前端会**禁用 Service Worker** 并清缓存，避免旧版壳
5. 浏览器里「删除缓存」不够，需「清除网站数据」或卸载重装 APK

## 启动 URL 注意

TWA `startUrl` 必须为 **HTTP 200** 的路径。`/webbook/app` 在 GitHub Pages 返回 404，会导致开屏动画后卡在图标界面。当前已改为 `/webbook/`（进入后由 React Router 跳转 `/app`）。

## 更新网站后

网站内容自动更新，**一般不用重打 APK**。修改 `twa-manifest.json`（包名、启动 URL、图标等）或 bump `appVersionCode` 后需重新 `android:apk`。

## 费用

| 项目 | 费用 |
|------|------|
| Bubblewrap / JDK / Android SDK | 免费 |
| Google Play 上架 | 不需要（侧载） |
| 网站托管 | 已有免费方案 |
