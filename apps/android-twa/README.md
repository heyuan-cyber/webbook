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

APK 要**无浏览器地址栏**全屏打开，网站需托管 Digital Asset Links：

```
https://heyuan-cyber.github.io/webbook/.well-known/assetlinks.json
```

首次打包后运行：

```powershell
npm run android:fingerprint
```

按提示把 keystore 指纹写入 `apps/web/public/.well-known/assetlinks.json`，然后 **重新部署前端**（git push）。

## 更新网站后

网站内容自动更新，**一般不用重打 APK**。仅当修改 `twa-manifest.json`（包名、图标等）时才需重新 `android:apk`。

## 费用

| 项目 | 费用 |
|------|------|
| Bubblewrap / JDK / Android SDK | 免费 |
| Google Play 上架 | 不需要（侧载） |
| 网站托管 | 已有免费方案 |
