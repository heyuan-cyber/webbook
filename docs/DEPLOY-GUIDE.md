# WebBook 免费部署指南（小白版）

个人知识库 **零 VPS** 部署说明：讲清原理，并给出可跟着做的步骤。

## 一、一句话说清楚

WebBook 把：

- **网页界面** → GitHub Pages（免费）
- **笔记数据** → 私有 GitHub 仓库（免费）
- **后端 API** → Cloudflare Workers（免费）
- **登录认证** → Supabase（免费）

组合在一起，不需要买服务器。

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户打开浏览器                                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ① 前端（GitHub Pages）                                               │
│     https://heyuan-cyber.github.io/webbook/                          │
│     React 页面：编辑器、管理后台                                        │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │ 登录/注册                      │ 读写信、AI
                ▼                               ▼
┌───────────────────────────┐    ┌────────────────────────────────────┐
│  ② Supabase（认证）        │    │  ③ Cloudflare Worker（API）         │
│     验证邮箱密码            │    │     https://webbook-api.heyuan-     │
│     签发 JWT 令牌           │    │     webbook.workers.dev             │
└───────────────────────────┘    └───────────────┬────────────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────┐
                    ▼                            ▼                    ▼
         ┌──────────────────┐        ┌──────────────────┐   ┌──────────────┐
         │ ④ GitHub 私有仓库  │        │ ⑤ DeepSeek API   │   │ Supabase     │
         │ webbook-data      │        │ AI 总结/待办      │   │ 校验 JWT     │
         └──────────────────┘        └──────────────────┘   └──────────────┘
```

### 五个角色分工

| 编号 | 服务 | 类比 | 作用 |
|------|------|------|------|
| ① | GitHub Pages | 店面 | 展示网页界面 |
| ② | Supabase | 门卫 | 登录、区分管理员 |
| ③ | Cloudflare Worker | 仓库管理员 | 鉴权后代读写笔记、调 AI |
| ④ | GitHub 私有仓 | 保险柜 | 存 `tree.json` 和笔记 JSON |
| ⑤ | DeepSeek | 助理 | 总结、提取待办（可选） |

**为什么浏览器不直接读 GitHub？** 仓库是私有的，token 不能放在前端。必须由 Worker 持密钥代理访问。

## 三、三种访问身份

| 身份 | 入口 | 能力 |
|------|------|------|
| 游客 | `/app` | 本地草稿；只看公开笔记 |
| 普通用户 | `/app` + 登录 | 云同步；读写自己的笔记 |
| 管理员 | `/admin` | 目录管理、AI 策略等后台功能 |

公开内容走 `/api/public/*`（免登录，只返回 `visibility: public` 的笔记）。

## 四、管理员配置

### 4.1 管理后台地址

```
https://heyuan-cyber.github.io/webbook/admin
```

### 4.2 当前预设管理员邮箱

```
1060707057@qq.com
```

通过环境变量 `VITE_ADMIN_EMAIL` 配置。满足以下**任一**条件即为管理员：

1. 注册邮箱与 `VITE_ADMIN_EMAIL` 一致 → 注册时自动写入 `role: admin`
2. 登录邮箱与 `VITE_ADMIN_EMAIL` 一致 → 登录时识别为 admin
3. Supabase 用户资料中 `user_metadata.role` 或 `app_metadata.role` 为 `admin`

### 4.3 首次成为管理员

**若尚未注册：**

1. 打开 https://heyuan-cyber.github.io/webbook/login
2. 用 `1060707057@qq.com` 注册
3. 按 Supabase 邮件验证（若开启了邮箱确认）
4. 登录后访问 `/admin`

**若已用其他邮箱注册过：**

在 Supabase 控制台 → Authentication → Users → 选中用户 → Raw User Meta Data 添加：

```json
{ "role": "admin" }
```

保存后重新登录。

### 4.4 管理后台功能现状

| 菜单 | 状态 |
|------|------|
| 目录管理 | ✅ 可用 |
| AI 策略 | ⚠️ 界面已有，部分逻辑待完善 |
| 用户管理 | ⚠️ 占位 |
| 系统设置 | ⚠️ 占位 |

笔记「公开 / 仅我」在编辑器顶部切换（登录后可见）。

## 五、数据仓库结构

私有仓库 `heyuan-cyber/webbook-data`：

```
data/
├── tree.json              # 左侧目录树
├── notes/
│   └── .../*.json         # 每篇笔记一个文件
└── meta/
    ├── ai-strategies.json
    └── reminders.json
```

## 六、请求流程（原理）

**游客读公开树：**

```
浏览器 → GET /api/public/tree → Worker → GitHub → 只返回 public 节点
```

**登录用户保存笔记：**

```
浏览器（带 JWT）→ PUT /api/notes/:id → Worker 校验 JWT → 写入 GitHub
```

## 七、从零部署步骤

### 阶段 0：注册账号（均免费）

| 服务 | 用途 |
|------|------|
| GitHub | 代码仓 + 数据仓 |
| Cloudflare | Workers API |
| Supabase | 登录认证 |
| DeepSeek | AI（可选） |

### 阶段 1：GitHub 仓库

| 仓库 | 可见性 | 用途 |
|------|--------|------|
| `heyuan-cyber/webbook` | 公开 | 前端代码 |
| `heyuan-cyber/webbook-data` | **私有** | 笔记数据 |

初始化数据仓：

```bash
cd WebBook
# .env 填好 GITHUB_TOKEN、GITHUB_REPO
npm run init:github
```

### 阶段 2：Supabase

1. 新建 Project
2. Settings → API 复制 URL 和 `anon` / `service_role` key
3. Authentication → Providers 开启 Email
4. 开发期可在 Settings 关闭「Confirm email」方便测试

### 阶段 3：GitHub PAT

Fine-grained token，至少包含：

- Contents: Read and write（数据仓）
- Pages: Read and write
- Workflow: Read and write
- Actions: Read and write（可选，用于 CI 变量）

### 阶段 4：部署 Cloudflare Worker

```powershell
cd workers/api
npx wrangler login
npx wrangler deploy
# 首次会要求注册 workers.dev 子域名，输入例如 heyuan-webbook（不要直接回车）

"你的GITHUB_TOKEN" | npx wrangler secret put GITHUB_TOKEN
"你的AI_API_KEY" | npx wrangler secret put AI_API_KEY
"你的SUPABASE_SERVICE_ROLE_KEY" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

> `wrangler subdomain` 命令已废弃，请用 deploy 交互或控制台注册子域名。

### 阶段 5：部署前端（GitHub Pages）

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**
2. 推送 `main`，`.github/workflows/deploy.yml` 自动构建部署
3. 构建环境变量（已在 workflow 中配置）：

| 变量 | 说明 |
|------|------|
| `VITE_BASE_PATH` | `/webbook/` |
| `VITE_API_BASE_URL` | Worker 地址 |
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | anon key（前端公开） |
| `VITE_ADMIN_EMAIL` | 管理员邮箱 |

### 阶段 6：验证

| 检查 | URL / 操作 | 期望 |
|------|------------|------|
| 前端 | https://heyuan-cyber.github.io/webbook/ | 看到欢迎页 |
| API | `.../api/public/tree` | 返回 JSON |
| 管理员 | `/admin` 用管理员邮箱登录 | 进入后台 |
| 同步 | 登录后新建笔记 | `webbook-data` 出现 JSON 文件 |

## 八、本地开发

```bash
cd WebBook
npm install
npm run dev        # 前端 http://localhost:5173
npm run dev:api    # API   http://localhost:8787
```

复制 `.env.example` 为 `.env` 并填写。未配置 Supabase 时自动使用 Mock 认证 + IndexedDB。

## 九、日常维护

| 改了什么 | 怎么上线 |
|----------|----------|
| 前端代码 | `git push` → GitHub Actions 自动部署 |
| Worker 代码 | `cd workers/api && npx wrangler deploy` |
| 密钥 | `npx wrangler secret put <NAME>` |
| 管理员邮箱 | 改 `deploy.yml` 的 `VITE_ADMIN_EMAIL` 后 push |

## 十、费用（个人使用）

| 服务 | 免费额度 | 够用？ |
|------|----------|--------|
| GitHub Pages | 公开站免费 | ✅ |
| GitHub 私有仓 | 免费 | ✅ |
| Cloudflare Workers | 10 万请求/天 | ✅ |
| Supabase | 5 万 MAU | ✅ |

## 十一、常见问题

**登录后不同步？** 检查 `VITE_API_BASE_URL` 是否指向 Worker。

**/admin 提示无权限？** 确认用 `1060707057@qq.com` 登录，或在 Supabase 设 `role: admin`。

**游客能看到私密笔记吗？** 不能，私密笔记需登录且走鉴权 API。

**密钥放哪？** 绝不提交 Git。本地放 `.env`，云端用 `wrangler secret put`。

## 十二、当前线上地址速查

| 项目 | 地址 |
|------|------|
| 用户端 | https://heyuan-cyber.github.io/webbook/app |
| 管理后台 | https://heyuan-cyber.github.io/webbook/admin |
| API | https://webbook-api.heyuan-webbook.workers.dev |
| 代码仓 | https://github.com/heyuan-cyber/webbook |
| 数据仓 | `heyuan-cyber/webbook-data`（私有） |
