# 用户主页仓（`heyuan-cyber.github.io`）

本目录部署到独立仓库 **`heyuan-cyber/heyuan-cyber.github.io`**，与 WebBook 项目仓（`/webbook/` 子路径）共用域名，职责不同：

| 路径 | 文件 | 作用 |
|------|------|------|
| `https://heyuan-cyber.github.io/` | `index.html` | **入口站**：导航到笔记本 / 博客 |
| `https://heyuan-cyber.github.io/.well-known/assetlinks.json` | `.well-known/assetlinks.json` | **TWA 验证**：Android 全屏 APK 在域名根查找 |

```
heyuan-cyber.github.io
├── /                    ← 本仓（user-pages）
│   ├── index.html
│   └── .well-known/assetlinks.json
└── /webbook/            ← WebBook 项目仓 Actions 部署
    ├── /app             笔记本
    ├── /blog            公开博客
    └── /admin           管理后台
```

## 目录内容

- **`index.html`** — 入口页（链接到 `/webbook/app` 与 `/webbook/blog`）
- **`.well-known/assetlinks.json`** — 由 `apps/web/public/.well-known/assetlinks.json` 同步，勿手改指纹

## 部署

```bash
# 推荐：本地脚本（需 GITHUB_TOKEN 或 remote 中的 PAT）
npm run deploy:user-pages

# 或：推送 user-pages/** 变更，触发 .github/workflows/deploy-user-pages.yml
#     需在仓库 Secrets 配置 USER_PAGES_DEPLOY_TOKEN
```

部署前若改过 APK 签名，先运行：

```bash
npm run android:fingerprint   # 同步 assetlinks 到 web + user-pages
```

## 验证

| 检查 | URL | 期望 |
|------|-----|------|
| 入口页 | https://heyuan-cyber.github.io/ | 显示 WebBook 导航卡片 |
| Asset Links | https://heyuan-cyber.github.io/.well-known/assetlinks.json | 返回 JSON（非 404） |
| 应用 | https://heyuan-cyber.github.io/webbook/app | 笔记本 |

若 assetlinks 仍 404：在 **`heyuan-cyber.github.io`** 仓库 Settings → Pages → Source 选 **Deploy from branch** → `main` 或 `master` → `/ (root)`。

## 修改入口页

编辑本目录 `index.html` 后重新 `npm run deploy:user-pages`。  
**不要**把入口页与 `/webbook/` 应用混在同一 Pages 项目——GitHub 用户站根路径与子路径由两个仓分别提供。

## 相关文档

- 总览与线上地址：仓库根目录 [README.md](../README.md)
- 架构与 TWA 说明：[docs/DEPLOY-GUIDE.md](../docs/DEPLOY-GUIDE.md)
- APK 构建：[apps/android-twa/README.md](../apps/android-twa/README.md)
