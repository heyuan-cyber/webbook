# WebBook 部署与架构学习指南（小白版）

> 这份文档不只是「怎么部署」，更希望帮你建立一套**现代 Web 应用**的基础认知：数据放哪、逻辑谁跑、各服务分工是什么。

## 阅读导航

| 你想了解… | 跳到 |
|-----------|------|
| 整体一句话 | [§一](#一一句话说清楚) |
| 各模块干什么、学哪些概念 | [§二 模块百科](#二模块百科--帮你建立计算机认知) |
| 用户数据到底存哪 | [§三 数据存哪](#三用户数据存哪里三层存储) |
| 后端逻辑谁执行 | [§四 后端逻辑](#四后端逻辑谁在跑) |
| 一次保存笔记的完整链路 | [§五 请求链路](#五一次保存笔记的完整链路) |
| 跟着做部署 | [§八 部署步骤](#八从零部署步骤) |
| 手机 APK | [§十三](#十三手机端与-apk免费侧载) |

---

## 一、一句话说清楚

WebBook 把四件免费服务拼成一套个人知识库：

| 层 | 服务 | 干什么 |
|----|------|--------|
| **界面** | GitHub Pages | 把 React 网页发给浏览器 |
| **数据** | GitHub 私有仓库 | 存笔记 JSON（你的「硬盘」） |
| **后端** | Cloudflare Workers | 鉴权、读写笔记、调 AI（你的「大脑」） |
| **登录** | Supabase | 验证邮箱密码、发 JWT 令牌（你的「门卫」） |

**不需要买 VPS（云服务器）**。传统网站要 7×24 开一台机器；这里全是「按需触发」的托管服务。

---

## 二、模块百科 — 帮你建立计算机认知

### 2.1 先懂三个词：前端 / 后端 / 数据库

```
┌─────────────┐     HTTP 请求      ┌─────────────┐     读写文件     ┌─────────────┐
│   前端       │  ──────────────►  │   后端       │  ──────────────► │   数据存储   │
│  (浏览器里)  │  ◄──────────────  │  (云端跑代码) │  ◄────────────── │  (持久化)    │
└─────────────┘     JSON 响应      └─────────────┘                  └─────────────┘
```

- **前端**：用户看得见、点得着的部分。WebBook 是 `apps/web`，React 写的单页应用（SPA）。
- **后端**：浏览器不能直接做的事（持密钥访问私有仓库、调付费 AI API）。WebBook 是 `workers/api`，跑在 Cloudflare 边缘节点。
- **数据库**：长期保存结构化数据的地方。WebBook **没有用 MySQL/Postgres**，而是用 **GitHub 仓库里的 JSON 文件** 当数据库——这叫「Git 即数据库」。

### 2.2 GitHub Pages — 静态网站托管

| 项目 | 说明 |
|------|------|
| **是什么** | GitHub 提供的免费网页托管。你 push 代码，它把构建好的 HTML/JS/CSS 放到 CDN 上。 |
| **WebBook 角色** | 托管用户界面：`/app` 编辑器、`/admin` 管理后台、`/login` 登录页。 |
| **线上地址** | https://heyuan-cyber.github.io/webbook/ |
| **代码位置** | `apps/web/`，由 `.github/workflows/deploy.yml` 自动构建部署。 |
| **学到什么** | **静态资源**：页面本身是「文件」，不含服务器逻辑；**CI/CD**：push 代码 → GitHub Actions 自动 build → 自动上线。 |
| **局限** | 只能放静态文件，不能跑 Node 后端；密钥不能写进前端 bundle。 |

**类比**：GitHub Pages 是「店面装修好的展示厅」，顾客（浏览器）进来逛，但保险柜钥匙不在店里。

### 2.3 Cloudflare Workers — Serverless 后端

| 项目 | 说明 |
|------|------|
| **是什么** | Cloudflare 在全球 300+ 节点运行的 **无服务器函数**。你写一段 JS，有 HTTP 请求时短暂执行，按次计费（免费额度很大）。 |
| **WebBook 角色** | 整个后端的「大脑」：校验登录、读写 GitHub、代理 DeepSeek AI、过滤公开/私密笔记。 |
| **线上地址** | https://webbook-api.heyuan-webbook.workers.dev |
| **代码位置** | `workers/api/src/` |

**主要路由（API 端点）**：

| 路径 | 谁可访问 | 做什么 |
|------|----------|--------|
| `GET /api/public/tree` | 任何人 | 返回公开目录树 |
| `GET /api/public/notes/:id` | 任何人 | 读单篇公开笔记 |
| `GET /api/tree` | 登录用户 | 读完整目录（含私密节点） |
| `GET/PUT /api/notes/:id` | 登录用户 | 读写信 |
| `POST /api/ai/run` | 登录用户 | 调 AI 总结/提取待办 |
| `GET /api/link-preview?url=` | 登录用户 | 抓取网页标题做链接预览 |

**密钥存在哪**：`GITHUB_TOKEN`、`AI_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 通过 `wrangler secret put` 存在 Cloudflare，**永远不会进 Git 或前端**。

**学到什么**：

- **Serverless（无服务器）**：你不用管机器开关机，平台按请求唤起函数。
- **BFF（Backend For Frontend）**：专门给自家前端服务的 API 层，把复杂集成藏在后面。
- **边缘计算**：请求在离用户近的节点处理，延迟低。

**类比**：Worker 是「有钥匙的仓库管理员」——顾客带着通行证（JWT）来，管理员去保险柜取放文件。

### 2.4 Supabase — 认证服务（Auth）

| 项目 | 说明 |
|------|------|
| **是什么** | 开源 Firebase 替代品。WebBook 主要用它的 **Auth（认证）** 模块，不用它的数据库。 |
| **WebBook 角色** | 注册、登录、邮箱验证；登录成功后发 **JWT（JSON Web Token）** 给浏览器。 |
| **存了什么** | 用户账号（邮箱、加密密码哈希）、`user_metadata`（如 `role: admin`）。**不存笔记正文**。 |
| **前端用的 key** | `VITE_SUPABASE_ANON_KEY`（anon key）— 设计为可公开，只能做客户端允许的操作。 |
| **后端用的 key** | `SUPABASE_SERVICE_ROLE_KEY` — 仅 Worker 持有，可校验任意用户的 JWT。 |

**学到什么**：

- **认证 vs 授权**：认证 =「你是谁」；授权 =「你能干什么」。Supabase 管认证；Worker 根据 JWT 和 `role` 管授权。
- **JWT**：一段签名的 JSON，浏览器每次请求 API 时放在 `Authorization: Bearer ...` 头里，Worker 验证签名确认身份。

**类比**：Supabase 是「发卡处」——证明你是会员，但不替你存笔记。

### 2.5 GitHub 私有仓库 — 数据层（Git as Database）

| 项目 | 说明 |
|------|------|
| **是什么** | 普通 Git 仓库，但对浏览器不可见（私有）。 |
| **仓库名** | `heyuan-cyber/webbook-data`（私有） |
| **WebBook 角色** | **唯一的数据持久化层**——所有笔记、目录树、AI 配置都以 JSON 文件存放。 |
| **为什么用 Git** | 每次保存 = 一次 commit，天然有**版本历史**；JSON 人类可读、方便备份迁移。 |

**目录结构**：

```
data/
├── tree.json                 # 左侧目录树（节点 id、标题、父子关系、排序）
├── notes/
│   └── <folder>/<id>.json    # 每篇笔记一个文件，内含 blocks[] 块数组
└── meta/
    ├── ai-strategies.json    # AI 策略配置（何时总结、提取待办）
    └── reminders.json        # AI 提取的待办提醒
```

**单篇笔记 JSON 长什么样（简化）**：

```json
{
  "id": "note-abc",
  "title": "我的第一篇笔记",
  "visibility": "private",
  "schemaVersion": 1,
  "blocks": [
    { "type": "heading", "level": 1, "text": "标题" },
    { "type": "paragraph", "text": "正文内容…" }
  ],
  "updatedAt": "2026-06-13T08:00:00.000Z"
}
```

**学到什么**：

- **文件型数据库**：Small data / personal scale 时，JSON 文件 + Git 比上 MySQL 更简单。
- **私有仓库 + PAT**：Personal Access Token 是 Worker 访问私有仓的钥匙，权限最小化（只给 Contents 读写）。

**类比**：数据仓是「保险柜里的文件夹」，只有持钥匙的 Worker 能开。

### 2.6 DeepSeek — 外部 AI API

| 项目 | 说明 |
|------|------|
| **是什么** | 大语言模型 API（类似 ChatGPT API）。 |
| **WebBook 角色** | 可选能力：保存笔记后自动总结、提取 TODO 写入 `reminders.json`。 |
| **谁调用** | 只有 Worker 调用（`workers/api/src/ai.ts`），API Key 存在 Worker secret。 |
| **为什么不让浏览器直调** | API Key 会暴露；且可在 Worker 里做限流、日志、策略控制。 |

**学到什么**：**第三方 API 集成**、**密钥后端代理**是标准安全做法。

### 2.7 浏览器本地存储 — 游客模式 & 离线

| 存储 | 技术 | 存什么 |
|------|------|--------|
| **IndexedDB** | 浏览器内置数据库 | 游客未登录时的笔记草稿 |
| **localStorage** | 浏览器键值存储 | 目录折叠状态、UI 偏好 |
| **Service Worker 缓存** | PWA 机制 | 已打开过的笔记、应用壳静态资源 |

**学到什么**：

- **本地优先（Local-first）**：没登录也能用，数据先写本机；登录后可合并上传。
- **PWA**：网页 + Service Worker ≈ 可安装、可部分离线的「准原生 App」。

### 2.8 Android TWA — 把 PWA 装进 APK

| 项目 | 说明 |
|------|------|
| **是什么** | Trusted Web Activity：一个极简 Android 壳，全屏打开你已部署的 PWA 网址。 |
| **包名** | `io.github.heyuan_cyber.twa` |
| **和 PWA 关系** | 网站更新后一般**不用重打 APK**；APK 只是启动器 + 全屏权限。 |
| **全屏条件** | `assetlinks.json` 证明 APK 签名与网站属于同一所有者（Digital Asset Links）。 |

---

## 三、用户数据存哪里？（三层存储）

这是很多小白最困惑的问题。按**身份**和**数据类型**分开看：

### 3.1 按身份

| 身份 | 笔记存在哪 | 目录树存在哪 | 账号存在哪 |
|------|------------|--------------|------------|
| **游客** | 浏览器 IndexedDB | 内存 / 本地 mock | 无账号 |
| **登录用户** | GitHub `data/notes/*.json` | GitHub `data/tree.json` | Supabase Auth |
| **管理员** | 同上（共享数据仓） | 同上 + `/admin` 管理 | Supabase + `role: admin` |

### 3.2 按数据类型

| 数据 | 主存储 | 副本/缓存 | 绝不存哪 |
|------|--------|-----------|----------|
| 笔记正文 | GitHub JSON | IndexedDB、SW 缓存 | Supabase、前端源码 |
| 目录结构 | `tree.json` | 浏览器内存 | — |
| 密码 | — | — | 任何地方明文（Supabase 只存哈希） |
| GitHub PAT | Cloudflare Secret | — | 前端、Git 仓库 |
| AI API Key | Cloudflare Secret | — | 前端 |
| JWT 会话令牌 | 浏览器内存/localStorage | — | 服务器会话表（无状态 JWT） |

### 3.3 一张总览图

```
                    ┌──────────────────────────────────────┐
                    │           你的浏览器                  │
                    │  ┌────────────┐  ┌────────────────┐  │
                    │  │ IndexedDB  │  │ Service Worker │  │
                    │  │ 游客草稿    │  │ 离线缓存        │  │
                    │  └────────────┘  └────────────────┘  │
                    └───────────────┬──────────────────────┘
                                    │ HTTPS
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   ┌─────────────┐          ┌─────────────┐          ┌─────────────┐
   │ GitHub Pages│          │  Supabase   │          │  CF Worker  │
   │  静态 UI     │          │  用户账号    │          │  业务逻辑    │
   └─────────────┘          └─────────────┘          └──────┬──────┘
                                                             │
                              ┌──────────────────────────────┼──────────┐
                              ▼                              ▼          ▼
                       ┌─────────────┐               ┌──────────┐ ┌─────────┐
                       │ GitHub 私有仓│               │ DeepSeek │ │ 校验 JWT │
                       │ 笔记 JSON   │               │   AI     │ │         │
                       └─────────────┘               └──────────┘ └─────────┘
```

---

## 四、后端逻辑谁在跑？

**结论：几乎所有「业务逻辑」都在 Cloudflare Worker 里执行。**

| 逻辑 | 跑在哪 | 源文件 |
|------|--------|--------|
| 路由分发、CORS | Worker | `workers/api/src/index.ts` |
| JWT 校验、管理员判断 | Worker | `workers/api/src/auth.ts` |
| 读写信、列目录 | Worker → GitHub API | `workers/api/src/github.ts` |
| 公开/私密过滤 | Worker | `workers/api/src/tree-filter.ts` |
| AI 总结、待办提取 | Worker → DeepSeek | `workers/api/src/ai.ts` |
| 链接预览 OG 解析 | Worker | `workers/api/src/index.ts` |
| 自动保存防抖 | **前端** | `apps/web` 编辑器 hooks |
| 块渲染、拖拽排版 | **前端** | `apps/web` React 组件 |
| 登录 UI、拿 JWT | **前端** → Supabase SDK | `apps/web` AuthContext |

**GitHub Actions** 只负责：push 代码 → 构建前端 → 上传到 Pages。**不跑**用户请求时的业务逻辑。

**Supabase** 只负责：注册/登录时验证密码、签发 JWT。**不跑**笔记 CRUD。

---

## 五、一次「保存笔记」的完整链路

以登录用户编辑并自动保存为例：

```
1. 用户在浏览器改了一个块
        ↓
2. 前端 debounce 300ms 后组装 Note JSON
        ↓
3. 前端从 Supabase 会话取出 access_token (JWT)
        ↓
4. PUT https://webbook-api.../api/notes/note-abc
   Header: Authorization: Bearer <JWT>
   Body: { id, title, blocks, visibility, ... }
        ↓
5. Cloudflare Worker 收到请求（就近边缘节点）
        ↓
6. auth.ts：用 SUPABASE_SERVICE_ROLE_KEY 验证 JWT 签名与过期时间
        ↓
7. github.ts：用 GITHUB_TOKEN 调 GitHub Contents API
   PUT /repos/heyuan-cyber/webbook-data/contents/data/notes/.../note-abc.json
        ↓
8. GitHub 写入文件并产生一次 commit（版本历史 +1）
        ↓
9. Worker 返回 200 + 更新后的 note
        ↓
10. 前端更新 UI「已保存」
        ↓
11. （异步）Worker 触发 on_save AI 策略 → 调 DeepSeek → 可能更新 reminders.json
```

**游客保存**则跳过 3–9 的云端部分，只写步骤 1–2 到 IndexedDB。

**公开访客阅读**：

```
GET /api/public/tree → Worker 读 tree.json → 过滤掉 visibility !== public 的节点 → 返回
```

---

## 六、三种访问身份

| 身份 | 入口 | 数据读写 | API 路径 |
|------|------|----------|----------|
| 游客 | `/app` | 仅本机 IndexedDB；可读公开笔记 | `/api/public/*` |
| 普通用户 | `/app` + 登录 | 云同步 GitHub | `/api/*`（带 JWT） |
| 管理员 | `/admin` | 同上 + 后台管理 | `/api/*` + `role: admin` |

笔记「公开 / 仅我」在编辑器顶部切换（`visibility` 字段，默认 `private`）。

---

## 七、管理员配置

### 7.1 管理后台地址

```
https://heyuan-cyber.github.io/webbook/admin
```

### 7.2 当前预设管理员邮箱

```
1060707057@qq.com
```

通过 `VITE_ADMIN_EMAIL` 配置。满足以下**任一**条件即为管理员：

1. 注册邮箱与 `VITE_ADMIN_EMAIL` 一致
2. 登录邮箱与 `VITE_ADMIN_EMAIL` 一致
3. Supabase 用户 `user_metadata.role` 或 `app_metadata.role` 为 `admin`

### 7.3 首次成为管理员

**若尚未注册：**

1. 打开 https://heyuan-cyber.github.io/webbook/login
2. 用 `1060707057@qq.com` 注册并验证邮箱
3. 登录后访问 `/admin`

**若已用其他邮箱注册过：** 在 Supabase → Authentication → Users → Raw User Meta Data 添加 `{ "role": "admin" }`，重新登录。

### 7.4 管理后台功能现状

| 菜单 | 状态 |
|------|------|
| 目录管理 | ✅ 可用 |
| AI 策略 | ⚠️ 界面已有，部分逻辑待完善 |
| 用户管理 | ⚠️ 占位 |
| 系统设置 | ⚠️ 占位 |

---

## 八、从零部署步骤

### 阶段 0：注册账号（均免费）

| 服务 | 用途 | 学到什么 |
|------|------|----------|
| GitHub | 代码仓 + 数据仓 + Pages | Git 协作、Actions CI |
| Cloudflare | Workers API | Serverless、DNS、CDN |
| Supabase | 登录认证 | BaaS、OAuth/JWT |
| DeepSeek | AI（可选） | LLM API 集成 |

### 阶段 1：GitHub 仓库

| 仓库 | 可见性 | 用途 |
|------|--------|------|
| `heyuan-cyber/webbook` | 公开 | 前端 + Worker 源码 |
| `heyuan-cyber/webbook-data` | **私有** | 笔记数据 |

```bash
cd WebBook
# .env 填好 GITHUB_TOKEN、GITHUB_REPO
npm run init:github
```

### 阶段 2：Supabase

1. 新建 Project
2. Settings → API 复制 URL 和 `anon` / `service_role` key
3. Authentication → Providers 开启 Email
4. 开发期可关闭「Confirm email」方便测试

### 阶段 3：GitHub PAT

Fine-grained token，权限至少：

- Contents: Read and write（数据仓）
- Pages: Read and write
- Workflow: Read and write

### 阶段 4：部署 Cloudflare Worker

```powershell
cd workers/api
npx wrangler login
npx wrangler deploy
# 首次会要求注册 workers.dev 子域名，例如 heyuan-webbook

"你的GITHUB_TOKEN" | npx wrangler secret put GITHUB_TOKEN
"你的AI_API_KEY" | npx wrangler secret put AI_API_KEY
"你的SUPABASE_SERVICE_ROLE_KEY" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

> `wrangler subdomain` 已废弃，用 deploy 交互或控制台注册子域名。

### 阶段 5：部署前端（GitHub Pages）

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**
2. 推送 `main`，`.github/workflows/deploy.yml` 自动构建
3. 构建变量（workflow 内）：

| 变量 | 作用 |
|------|------|
| `VITE_BASE_PATH` | `/webbook/` 子路径 |
| `VITE_API_BASE_URL` | Worker 地址 |
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | 前端公开 anon key |
| `VITE_ADMIN_EMAIL` | 管理员邮箱 |

### 阶段 6：验证

| 检查 | URL / 操作 | 期望 |
|------|------------|------|
| 前端 | https://heyuan-cyber.github.io/webbook/ | 欢迎页 |
| API | `.../api/public/tree` | JSON |
| 管理员 | `/admin` 用管理员邮箱登录 | 进入后台 |
| 同步 | 登录后新建笔记 | `webbook-data` 出现 JSON |

---

## 九、本地开发

```bash
cd WebBook
npm install
npm run dev        # 前端 http://localhost:5173
npm run dev:api    # API   http://localhost:8787
```

复制 `.env.example` 为 `.env`。未配置 Supabase 时自动 **Mock 认证 + IndexedDB**，核心功能可离线体验。

**本地 vs 线上的区别**：

| | 本地 | 线上 |
|--|------|------|
| 前端 | Vite dev server | GitHub Pages |
| API | wrangler dev 本机 | Cloudflare 边缘 |
| 数据 | `.env` 指向的 GitHub 仓 | 同上 |
| 认证 | Mock 或 Supabase | Supabase |

---

## 十、日常维护

| 改了什么 | 怎么上线 | 影响范围 |
|----------|----------|----------|
| 前端 `apps/web/**` | `git push` → Actions 自动部署 | 界面、PWA、assetlinks |
| Worker `workers/api/**` | `npx wrangler deploy` | API 逻辑、鉴权 |
| 密钥 | `wrangler secret put <NAME>` | 后端凭据 |
| 管理员邮箱 | 改 `deploy.yml` 的 `VITE_ADMIN_EMAIL` 后 push | 谁能进 `/admin` |
| 仅数据仓笔记 | 在 App 里编辑保存即可 | 无需 redeploy |

---

## 十一、费用（个人使用）

| 服务 | 免费额度 | 够用？ |
|------|----------|--------|
| GitHub Pages | 公开站免费 | ✅ |
| GitHub 私有仓 | 免费 | ✅ |
| Cloudflare Workers | 10 万请求/天 | ✅ |
| Supabase | 5 万 MAU | ✅ |
| DeepSeek | 按量，有免费额度 | ✅ 轻度使用 |

---

## 十二、常见问题

**登录后不同步？** 检查 `VITE_API_BASE_URL` 是否指向 Worker；浏览器 Network 看 API 是否 401。

**/admin 无权限？** 确认管理员邮箱或 Supabase `role: admin`。

**游客能看到私密笔记吗？** 不能。私密内容必须登录且走 `/api/notes/*`。

**密钥能放前端吗？** 绝不能。`GITHUB_TOKEN`、`AI_API_KEY`、`service_role` 只放 Worker secret。

**数据和代码在同一个仓库吗？** 不。代码在 `webbook`（公开），笔记在 `webbook-data`（私有）——**关注点分离**。

**为什么用 Worker 而不是 Vercel/自建 Express？** 免费、全球边缘、与 Cloudflare 生态集成；个人项目足够。

---

## 十三、手机端与 APK（免费侧载）

### 手机浏览器 / PWA

- 竖屏点左上角 **☰** 打开目录抽屉
- 可「添加到主屏幕」安装 PWA
- 已打开过的笔记离线只读（Service Worker）

### 打包 APK

详见 **[apps/android-twa/README.md](../apps/android-twa/README.md)**。

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17.0.2"
$env:ANDROID_HOME = "$env:USERPROFILE\.bubblewrap\android_sdk"
npm run android:apk
npm run android:fingerprint
git push
```

**开屏卡在图标？** 常见原因是启动 URL 返回 HTTP 404。当前 TWA 已改为 `/webbook/`（200），修改后需重打 APK 并覆盖安装。

**TWA 全屏验证：** Android 在 `https://heyuan-cyber.github.io/.well-known/assetlinks.json`（域名根）查找。除项目内的 `/webbook/.well-known/` 外，还需在 `heyuan-cyber.github.io` 用户主页仓放置相同内容的 `assetlinks.json`。

APK 输出：`apps/android-twa/app-release-signed.apk`。网站内容更新后一般**不用**重打 APK。

---

## 十四、术语速查（学完可跟别人解释架构）

| 术语 | 一句话 |
|------|--------|
| SPA | 单页应用，一个 HTML 壳，路由切换不整页刷新 |
| API / REST | 前后端用 HTTP + JSON 对话的约定 |
| JWT | 无状态登录凭证，后端验证签名即可 |
| Serverless | 无服务器，按请求执行，不用租 VPS |
| CDN | 内容分发网络，静态资源就近缓存 |
| PAT | GitHub 个人访问令牌，程序化访问仓库 |
| BFF | 给前端定制的后端聚合层 |
| PWA | 可安装、可离线的渐进式网页应用 |
| TWA | Android 全屏信任网页容器 |
| IndexedDB | 浏览器里的大容量结构化存储 |
| CI/CD | 持续集成/部署，push 自动构建上线 |

---

## 十五、当前线上地址速查

| 项目 | 地址 |
|------|------|
| 用户端 | https://heyuan-cyber.github.io/webbook/app |
| 管理后台 | https://heyuan-cyber.github.io/webbook/admin |
| API | https://webbook-api.heyuan-webbook.workers.dev |
| 代码仓 | https://github.com/heyuan-cyber/webbook |
| 数据仓 | `heyuan-cyber/webbook-data`（私有） |

---

## 十六、本仓库代码地图（对照学习）

```
WebBook/
├── apps/web/              # 前端：React UI、编辑器、PWA、登录页
│   └── public/.well-known/assetlinks.json   # TWA 全屏验证
├── workers/api/src/       # 后端：鉴权、GitHub 同步、AI 代理
│   ├── index.ts           # 路由入口
│   ├── auth.ts            # JWT 校验
│   ├── github.ts          # 读写数据仓
│   ├── tree-filter.ts     # 公开/私密过滤
│   └── ai.ts              # DeepSeek 调用
├── packages/shared/       # 前后端共享的 TypeScript 类型
├── apps/android-twa/      # TWA APK 工程（Bubblewrap 生成）
└── .github/workflows/     # push 自动部署 GitHub Pages
```

建议学习顺序：`packages/shared` 看数据模型 → `workers/api` 看 API → `apps/web` 看界面如何调 API。
