# WebBook · 个人知识库

个人知识、项目记录与私密笔记平台。**零 VPS**：数据与版本托管在 GitHub，认证与 AI 由免费 serverless（Cloudflare Workers）补齐，前端为可安装到主屏幕的 PWA。

## 特性

- 🌲 **树形多层级目录** — 折叠、拖拽、跨设备同步
- 🧱 **块编辑器** — 标题 / 文本 / 列表 / 待办 / 图片 / 视频 / 链接预览 / 标注
- 🎨 **自由排版画布块** — 在笔记任意位置插入，元素可拖拽自由排布
- 👤 **游客 / 登录双模式** — 游客数据仅存本机；登录后同步到 GitHub
- 🛠 **管理后台** — 目录管理、AI 策略配置、用户管理、系统设置
- 🤖 **可配置 AI 策略** — 写完即总结、每晚定时整理、TODO 提取提醒（DeepSeek 等）
- 📱 **PWA** — 添加到主屏幕、离线读已缓存笔记、手机预览优先

## 目录结构

```
WebBook/
├── apps/web/          # 前端 (Vite + React + TS, PWA)
├── workers/api/       # Cloudflare Workers API (GitHub 同步 + AI 代理)
├── packages/shared/   # 共享类型 (Note / Block / TreeNode / AIStrategy)
└── .github/workflows/ # GitHub Pages 部署
```

## 本地开发

```bash
cd WebBook
npm install

# 前端（默认 http://localhost:5173），游客模式开箱即用
npm run dev

# Workers API（另开终端，默认 http://localhost:8787）
npm run dev:api
```

> 未配置任何密钥时，前端以 **本地 Mock 认证 + IndexedDB** 运行，所有核心交互（树、块编辑、画布）均可体验。

## 接入真实后端

### 1. GitHub 数据仓库

新建一个仓库（如 `your-name/webbook-data`）存放笔记 JSON。

```bash
cd workers/api
npx wrangler secret put GITHUB_TOKEN     # 有 repo 写权限的 PAT
# 在 wrangler.toml 的 [vars] 中设置 GITHUB_REPO / GITHUB_BRANCH
```

### 2. AI Provider（DeepSeek）

```bash
npx wrangler secret put AI_API_KEY
# wrangler.toml: AI_BASE_URL=https://api.deepseek.com, AI_MODEL=deepseek-chat
```

### 3. 认证（Supabase）

在 `AuthContext.tsx` 的 seam 处切换为 `supabaseProvider`，并填写：

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

环境变量模板见 `.env.example`。

## 部署与学习

**推荐先读** **[docs/DEPLOY-GUIDE.md](docs/DEPLOY-GUIDE.md)** — 不只是部署步骤，还讲清：

- 用户数据存哪（IndexedDB / GitHub 私有仓 / Supabase）
- 后端逻辑谁跑（Cloudflare Workers 各路由做什么）
- GitHub Pages、Supabase、DeepSeek 等每个模块的分工与计算机概念
- 一次保存笔记的完整请求链路

适合小白快速建立「现代 Web 应用」整体认知。

- **前端 → GitHub Pages**：推送到 `main` 触发 `.github/workflows/deploy.yml`
  - 在仓库 Settings → Pages 选择 GitHub Actions
  - 构建变量见 `deploy.yml`（含 `VITE_ADMIN_EMAIL`）
- **API → Cloudflare Workers**：`cd workers/api && npx wrangler deploy`
- **Android APK（侧载）**：`npm run android:init` → `npm run android:apk`（见 `apps/android-twa/README.md`）

## 私密性升级路径

初期可用公开仓库。需要私密时：

1. 将数据仓库转为 **Private**
2. 升级 **GitHub Pro** 以启用私密 Pages（或改用 Cloudflare Pages 免费私密）
3. 数据格式带 `schemaVersion`，迁移无损

## 路线图

对应 `openspec/changes/webbook/tasks.md`：

- Phase 1 ✅ 脚手架 + 树 + 块编辑 + 游客/登录 + 同步骨架
- Phase 2 🎨 画布块 + 富媒体（进行中）
- Phase 3 🤖 管理后台 + AI 策略引擎
- Phase 4 📱 PWA 强化 + 手机预览 + 提醒面板
