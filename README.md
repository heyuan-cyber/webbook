# WebBook · 个人知识库

个人知识、项目记录与私密笔记平台。**零 VPS**：数据与版本托管在 GitHub，认证与 AI 由免费 serverless（Cloudflare Workers）补齐，前端为可安装到主屏幕的 PWA。

## 线上地址

| 页面 | URL | 说明 |
|------|-----|------|
| **入口站** | https://heyuan-cyber.github.io/ | 域名根导航（独立用户主页仓） |
| 笔记本 | https://heyuan-cyber.github.io/webbook/app | 主应用 |
| 公开博客 | https://heyuan-cyber.github.io/webbook/blog | `visibility: public` 的笔记 |
| 管理后台 | https://heyuan-cyber.github.io/webbook/admin | 目录与策略 |

入口站与 TWA 域名根配置见 **[user-pages/README.md](user-pages/README.md)**，部署：`npm run deploy:user-pages`。

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
├── user-pages/        # 入口站 + 域名根 assetlinks → heyuan-cyber.github.io 仓
└── .github/workflows/ # GitHub Pages 部署（应用 + user-pages）
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

### 2b. 联网检索（可选）

编辑器 AI 可说「整理今日新闻」或「帮我搜索 XXX」：Worker 并行拉国内+国际搜索与 RSS，再排版成笔记。

```bash
# wrangler.toml 已配置国内 RSS（IT之家/Solidot/少数派）与国际补充源
# 国内搜索：open.bochaai.com 申请 key → 默认 SEARCH_PROVIDER_DOMESTIC=bocha
npx wrangler secret put SEARCH_API_KEY
# 可选：国际搜索另设 Tavily key
# npx wrangler secret put SEARCH_API_KEY_INTERNATIONAL

# 比例与源可在 wrangler.toml 调整：
# RSS_FEEDS_DOMESTIC / RSS_FEEDS_INTERNATIONAL / DOMESTIC_NEWS_RATIO=0.7
```

本地 `workers/api/.dev.vars` 同样可加 `SEARCH_API_KEY`、`RSS_FEEDS_DOMESTIC` 等。

### 3. 认证（Supabase）

在 `AuthContext.tsx` 的 seam 处切换为 `supabaseProvider`，并填写：

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

环境变量模板见 `.env.example`。

## 部署与学习

**推荐先读** **[docs/DEPLOY-GUIDE.md](docs/DEPLOY-GUIDE.md)** — 架构、部署、各模块分工。

**产品需求**见 **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)** — 可手写或与 AI 协作填写；后续据此对比现状并规划迭代。

| 部署目标 | 命令 / 触发 | 产物 |
|----------|-------------|------|
| **应用** `/webbook/` | 推送到 `main` → `deploy.yml` | 笔记本、博客、PWA、APK 资源 |
| **入口站** 域名根 | `npm run deploy:user-pages` 或改 `user-pages/**` | `index.html` + 根路径 assetlinks |
| **API** | `cd workers/api && npx wrangler deploy` | 同步、鉴权、AI、图片上传 |

- **前端 → GitHub Pages**：推送到 `main` 触发 `.github/workflows/deploy.yml`
  - 在仓库 Settings → Pages 选择 GitHub Actions
  - 构建变量见 `deploy.yml`（含 `VITE_ADMIN_EMAIL`）
- **Android APK（侧载）**：`npm run android:init` → `npm run android:apk`（见 `apps/android-twa/README.md`）
- **冒烟检查**：`VITE_API_BASE_URL=... npm run smoke`（API 自动检查 + 手动 E2E 清单）

## 私密性升级路径

初期可用公开仓库。需要私密时：

1. 将数据仓库转为 **Private**
2. 升级 **GitHub Pro** 以启用私密 Pages（或改用 Cloudflare Pages 免费私密）
3. 数据格式带 `schemaVersion`，迁移无损

## 路线图

对应 `openspec/changes/webbook/tasks.md`：

- Phase 1 ✅ 脚手架 + 树 + 块编辑 + 游客/登录 + 同步骨架
- P1 基础体验 ✅ 键盘导航、图片上传、预览、搜索、toast
- P2 博客 🚧 公开 `/blog` 列表与文章页（场景⑤ 基础）
- Phase 3+ 🤖 提醒面板、历史版本、富文本进阶、账单、社交
