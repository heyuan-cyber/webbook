# WebBook 部署与架构学习指南（小白版）

> 这份文档不只是「怎么部署」，更希望帮你建立一套**现代 Web 应用**的基础认知：数据放哪、逻辑谁跑、各服务分工是什么。

---

## 一、这句话说清 WebBook 是什么

WebBook 把一个块编辑器笔记应用直接搬上 GitHub Pages + Cloudflare Worker，做成**带私密朋友圈的个人博客系统**。

```
           访问者浏览器                   你（登录用户）
               │                              │
               ▼                              ▼
        ┌──────────────┐             ┌──────────────┐
        │ GitHub Pages  │             │  Supabase    │
        │  静态页面壳    │             │  登录认证     │
        └──────┬───────┘             └──────┬───────┘
               │                            │ JWT
               ▼                            ▼
        ┌──────────────────────────────────────────┐
        │     Cloudflare Worker（业务逻辑 + 鉴权）    │
        └────────────────┬─────────────────────────┘
                         │ GITHUB_TOKEN
                         ▼
        ┌──────────────────────────────────────────┐
        │     GitHub 私有仓（webbook-data）           │
        │     data/users/{userId}/notes/*.json       │
        │     data/users/{userId}/tree.json          │
        │     data/meta/circles/*.json               │
        └──────────────────────────────────────────┘
```

**你的数据不在传统数据库里**。每一篇笔记是一个 JSON 文件，存在你名下的 GitHub 私有仓库，每次保存产生一次 Git commit。  
**不需要买 VPS**——四个免费云服务拼起来跑一个完整网站。

---

## 二、构成 WebBook 的四个云服务

### 2.1 GitHub Pages —— 发界面

| 项目 | 说明 |
|------|------|
| 干什么 | 托管 HTML/CSS/JS 文件。用户打开网址，浏览器下载这些文件来渲染界面。 |
| WebBook 用它 | 存放 React 单页应用、PWA Service Worker、TWA assetlinks |
| 线上地址 | `https://heyuan-cyber.github.io/webbook/` |
| 怎么部署上线 | `git push main` → `.github/workflows/deploy.yml` 自动构建并上传 |
| 局限 | 只能放**静态**文件；不能跑后端逻辑、不能存密钥 |

> **类比**：装修好的展示厅——顾客进来看，但保险柜不在店里。

---

### 2.2 Cloudflare Workers —— 跑逻辑

| 项目 | 说明 |
|------|------|
| 干什么 | 在全球 300+ 节点运行的 Serverless 函数。有 HTTP 请求时被唤醒，执行完即销毁。 |
| WebBook 用它 | 全部的「业务逻辑」：JWT 校验、读写 GitHub 数据仓、调 AI、过滤公开/私密、圈子鉴权 |
| 线上地址 | `https://webbook-api.1060707057.workers.dev` |

**Worker 就是后端，它负责任的完整清单：**

| 事情 | 代码位置 |
|------|----------|
| 路由分发、CORS | `index.ts` |
| 用户 JWT 校验 + 管理员邮箱判定 | `auth.ts` |
| 读写 GitHub 私有仓的 JSON 文件 | `github.ts` |
| 用户笔记 / 树 读写 | `userData.ts` |
| 注册用户索引 | `usersRegistry.ts` |
| 公开/私密笔记过滤 | `tree-filter.ts` |
| 公共 feed 聚合、去重、广场 | `publicFeed.ts` |
| 圈子创建、邀请、成员鉴权、协作 | `circles.ts` + `circleData.ts` |
| 文章评论（公开 + 登录） | `comments.ts` |
| 待办提醒 | 已下线，见「任务规划」（`plan.ts`） |
| **任务规划（单文件 + 乐观锁）** | `plan.ts` |
| 资产上传 / 分卷存储（多仓、40MB 上限） | `assets.ts` + `volumes.ts` |
| AI 策略（保存后总结等） | `aiStrategies.ts` |
| 飞书 OAuth + 导出 / zip 导入 | `feishu.ts` |
| 管理员后台接口（用户/设置/AI/公开内容） | `admin.ts` + `adminContent.ts` |
| AI 对话、联网搜索、总结 | `ai/` |
| 节点 AI 生成（provider 目录 / 异步任务 / 文图视频3D） | `ai/`（generateProviders / jobs / adapters） |
| 旧版数据迁移 | `migrateLegacy.ts` |

> **类比**：持钥匙的仓库管理员——顾客带通行证（JWT）来，管理员去保险柜（GitHub 私有仓）取放文件。

---

### 2.3 Supabase —— 管登录

| 项目 | 说明 |
|------|------|
| 干什么 | 开源 Firebase 的认证模块，帮用户注册、登录、发 JWT。WebBook **只用它的 Auth，不用它的数据库**。 |
| 存了什么 | 邮箱 + 加密密码哈希 + `user_metadata`（如角色）。**不存笔记正文，不存目录树。** |
| 前端用的 key | `VITE_SUPABASE_ANON_KEY`（anon key）—— 放在前端 bundle 里也没关系，SupaBase 会限制它只能做注册/登录等操作 |
| 后端用的 key | `SUPABASE_SERVICE_ROLE_KEY` — 只有 Worker 持有，用来**校验**任何用户的 JWT |

> **类比**：大厦大堂的发卡处——证明你是会员，但不替你存保险柜里的东西。

---

### 2.4 GitHub 私有仓（webbook-data）—— 存数据

| 项目 | 说明 |
|------|------|
| 干什么 | **唯一的数据持久化层**。所有笔记、目录、圈子配置、AI 设置都以 `.json` 文件形式存在这里。 |
| 仓库 | `heyuan-cyber/webbook-data`（未公开） |
| 谁可以访问 | 只有 **Worker 凭 GITHUB_TOKEN** 可以读写。浏览器无法直连，管理员改数据也必须通过 Worker API |

**目录结构（当前现状）：**

```
data/
├── tree.json                        ← 【遗留】旧版全局目录树
├── notes/{noteId}.json              ← 【遗留】旧版单篇笔记
├── users/
│   └── {userId}/
│       ├── tree.json                ← 该用户的目录树（节点标题、可见性、排序）
│       └── notes/{noteId}.json      ← 该用户的单篇笔记正文
├── meta/
│   ├── users-index.json             ← 注册用户索引（id / email）
│   ├── settings.json                ← 系统设置（GitHub/AI 供应商）
│   ├── ai-strategies.json           ← AI 策略配置
│   ├── public-circles-index.json    ← 公开圈子索引
│   └── circles/{circleId}.json      ← 圈子配置（成员、权限）
├── circles/{circleId}/              ← 圈子协作笔记
│   ├── tree.json
│   └── notes/{noteId}.json
├── comments/{ownerId}/{noteId}.json ← 文章评论
└── assets/{filename}                ← 【遗留】旧版全局静态资源
```

**一篇笔记的文件内容示例：**

```json
{
  "id": "note-abc123",
  "title": "我的第一篇笔记",
  "visibility": "private",
  "schemaVersion": 1,
  "blocks": [
    { "type": "heading", "level": 1, "text": "标题" },
    { "type": "paragraph", "text": "正文内容…" }
  ],
  "createdAt": "2026-06-13T08:00:00.000Z",
  "updatedAt": "2026-06-13T08:00:00.000Z"
}
```

> **类比**：保险柜里的文件夹——只有持钥匙的 Worker 能打开。

---

### 2.5 浏览器本地 —— 离线辅助

| 技术 | 存什么 |
|------|--------|
| **IndexedDB** | 游客未登录时的笔记草稿 |
| **localStorage** | 目录折叠状态、JWT 令牌 |
| **Service Worker 缓存** | PWA 离线缓存——已经打开过的笔记、应用壳 |

> **类比**：你桌面的草稿纸——在把笔记存进保险柜之前，先在本地写。

---

### 2.6 DeepSeek —— AI 能力（可选）

| 项目 | 说明 |
|------|------|
| 干什么 | 大语言模型 API，支持对话、总结、联网搜索 |
| 谁调用它 | 只有 Worker 的 AI 模块（`src/ai/`），你的 AI_API_KEY 存在 `wrangler secret` |
| 什么时候调 | 主动在 AI 面板对话 / 保存后自动总结 / 联网简报定时任务 |

---

## 三、数据流：一次保存从浏览器到磁盘的完整旅程

```
你的浏览器 → HTTPS → Cloudflare Worker → HTTPS → GitHub API → 私有仓磁盘

每一步经过的地方，以及谁看得到数据，看下表：
```

### 3.1 登录用户保存一篇笔记

```
1. 你在编辑器改了内容
        │
2. 前端 300ms 防抖 → 组装 Note JSON
        │  （此时数据在浏览器内存中）
3. 取出登录时 Supabase 发的 JWT（在内存/localStorage）
        │
4. PUT https://webbook-api.../api/notes/{noteId}
    Header: Authorization: Bearer <JWT>
    Body: 完整 Note JSON（含私密正文）
        │
        ▼
5. Cloudflare Worker 收到请求（可能在任何边缘节点）
    → auth.ts：用 SERVICE_ROLE_KEY 调 Supabase Auth API 校验 JWT
    → 拿到 user.id、user.email、user.role
    → 验证 user.id 与请求的笔记 owner 一致
        │
6. github.ts：用 GITHUB_TOKEN 调 GitHub Contents API
    PUT /repos/heyuan-cyber/webbook-data/contents/
        data/users/{userId}/notes/{noteId}.json
        │
        ▼
7. GitHub 服务端写入文件 → 产生一次 commit
    → 版本历史 +1（可通过「历史版本」回滚）
        │
8. Worker 返回 200 + 更新后的 note 给浏览器
        │
9. 前端显示「已保存」绿色提示
        │
10.【异步】Worker 若有 on_save AI 策略 → 调 DeepSeek
    → 可能产生摘要 → 写入 GitHub（又是一个 commit）

    注：保存笔记不再产生任何任务副作用。任务只从规划弹窗创建，
        见「任务规划」一节。
```

### 任务规划（plan.json + 乐观锁）

**数据布局**：整棵任务树存在**单个文件** `data/users/{userId}/plan.json`。

```
data/users/{uid}/
  ├── tree.json          结构中枢（folder / note 嵌套）
  ├── notes/{id}.json
  ├── reminders.json     已下线，仅一次性迁移时读取，不再写入
  └── plan.json          任务规划：{ schemaVersion, nodes: PlanNode[], migratedReminders? }
```

选单文件而非每节点一个文件，是因为**父栏目要聚合到最深后代**：分片方案下打开一个深层栏目
需要按后代数量发起 N 次 Contents API 请求，延迟随层级线性增长。

**代价**：每次变更都提交整份文档。若 `plan.json` 超过约 1MB 或节点数超过约 3000，
应考虑按栏目子树分片 + 顶层索引（属独立变更，当前未实现）。

**并发语义（重要）**：`github.ts` 的常规写入是 last-write-wins，且把 409 当网络抖动重试。
规划写入**不能**复用这条路径，否则两设备并发会静默丢掉整份规划。因此：

```
GET /api/plan → { plan, baseSha }
PUT /api/plan → body { plan, baseSha }
     Worker: getSha(path) !== baseSha → 409 { error:'conflict', baseSha }   ← 不重试
     前端:   409 → 重拉最新版 → 把本地这份整体重放一次；连续 3 次失败则提示
```

`putFileConditional()` 走同一把 repo 写锁，因此"读 sha → 写"在同一 isolate 内不可分割。
改动这一层时请保持 `FileConflictError` 不被外层 catch 压成 500——客户端要靠状态码区分
"该重拉重放"与"该直接报错"。

**锚定模型**：每个任务可带 `anchorNodeId` 指向 `TreeNode.id`。打开某节点的规划时，
可见任务 = 锚在该节点**及其全部后代**上的任务。这个聚合在前端用纯函数完成
（`packages/shared/src/plan.ts`），Worker 不需要知道笔记树的结构。

**任务只从规划弹窗创建**：`- [ ]` 文本不再被抽取成任务。原来的 `extract_todos`
动作（含 cron 策略）已随 reminders 下线。

**这条链路上谁看得到笔记内容：**
| 环节 | 谁能看到正文 |
|------|-------------|
| 你的浏览器 | **你** |
| HTTPS 传输 | 加密，Cloudflare 边缘节点暂存（内存，按请求销毁） |
| Worker 内存 | 代码逻辑可读（你的 Worker，不离开 Cloudflare 基础设施） |
| GitHub API 传输 | 加密，GitHub 服务端日志记录 |
| GitHub 私有仓磁盘 | **有你仓库 PAT 的人、仓库协作者** |
| **Supabase** | **看不到**（只校验 JWT 签名，不碰笔记） |

### 目录树（tree.json + 乐观锁）

目录树此前是**无条件整树覆盖**：任何客户端把自己手里的那棵树 PUT 上去就直接落盘，没有版本比对。
2026-09-26 的一次写入因此在**一次提交内**抹掉了 23 个栏目、13 篇笔记引用——写入方持有的是一棵
只在浏览器本地存在过的旧树（详见 `openspec/changes/tree-sync-integrity/`）。

现在与规划共用同一套条件写原语，但**冲突的处理方式刻意不同**：

```
GET /api/tree → { schemaVersion, roots, _rev }
PUT /api/tree → body { tree, baseRev }
     Worker: getSha(path) !== baseRev → 409 { error:'conflict', _rev }   ← 不重试
     前端:   409 → 暂停目录的自动写入，询问用户「保留云端版本」还是「用本地覆盖云端」
```

与规划的关键差别：规划冲突后可以**自动重放**（单份文档、单人编辑）；目录树**绝不自动重放**——
重放一棵过期的树正是要修的那个故障，所以必须由人来决定保留哪一份。

另外两条防线：

- **降级读不得升格为权威写**：云端目录读失败、或服务端未返回 `_rev`（旧版 Worker）时，客户端进入
  「本地模式」，其间目录改动只写本机 IndexedDB，不发远端写，并在界面上明确提示。
- **游客目录以并集合并，不覆盖**：登录时上传本地草稿，是把本地节点按 id 并入云端树
  （`packages/shared/src/treeMerge.ts`），云端已有节点一律保持原样。

**服务端内部写也必须带 revision**：笔记保存路径上的「可见性同步」同样是整树读-改-写，
现走 `saveUserTreeConditional` 并带当前 revision（冲突重读一次，失败不阻断笔记保存）。
只有 legacy 的一次性引导迁移仍使用无条件写。

**体检**：`npm run audit:tree` 只读比对「树引用的笔记」与「磁盘上存在的笔记文件」，
报告孤儿（文件在、树里没有）、悬空引用与重复节点 id。孤儿**不代表数据损坏**——笔记文件是完整的，
只是目录树不再引用它，可通过「目录历史」回滚或重新挂回。

### 3.2 游客保存（不登录）

```
1. 编辑内容 → Note JSON
        │
2. 写入浏览器 IndexedDB
        │
3. 停留在本地——**不**发到任何网络服务
```

游客数据**只有**在本地浏览器存在。登录后可以选择上传合并到云端。

### 3.3 匿名访客看一篇公开笔记

```
1. 打开博客广场 → 前端调 GET /api/public/feed
        │
2. Worker 遍历所有已有用户的 tree.json
    → 收集 visibility === 'public' 的节点
    → 返回：{ noteId, title, summary, ownerId, ownerEmail }
        │
3. 点击文章 → GET /api/public/notes/{ownerId}/{noteId}
    → Worker 读 GitHub JSON
    → 检查 note.visibility === 'public'
    → 返回完整 Note JSON
        │
4. 浏览器渲染成文章
```

**访客全程无需 JWT、无需登录。** 互联网上任何人可以直接调这些 API。

### 3.4 圈成员读圈内文章

```
1. 登录（有 JWT）→ GET /api/circles/{circleId}/feed
        │
2. Worker 校验 JWT → 校验 isMember(circle, userId)
    → 遍历所有成员 personal 树
    → 收集 visibility === 'public' 或 'circle' 的节点
        │
3. GET /api/circles/{circleId}/member-blog/{ownerId}/{noteId}
    → 再次校验 JWT + isMember
    → 读 data/users/{ownerId}/notes/{noteId}.json
    → 检查 visibility 为 public 或 circle
    → 返回完整 Note JSON（只有成员可见）
```

非成员：JWT 校验不过 → **403/404**。匿名请求：**401**。

---

## 四、多用户数据隔离

### 4.1 三种可见性

```
private     → 仅本人（for 个人草稿/日记）
circle      → 该圈子所有成员可见（for 私密朋友圈）
public      → 互联网任何人可见（for 博客文章）
```

| 可见性 | 在哪显示 | 谁可读 | 进 GitHub 哪 |
|--------|---------|--------|-------------|
| private | 仅自己 `/api/notes` | 自己（JWT + userId 匹配） | `data/users/{你}/notes/` |
| circle | 圈子 feed + 自己的博客 | 圈子成员（JWT + isMember） | 同上 |
| public | 所有人：博客广场 + 个人博客 | 互联网任何人（无需登录） | 同上 |

### 4.2 管理员权限

管理员邮箱 = `VITE_ADMIN_EMAIL`。满足以下**任一**条件：

1. 登录邮箱与 `VITE_ADMIN_EMAIL` / Worker 的 `ADMIN_EMAIL` 一致（**推荐**）
2. Supabase 用户 metadata 中有 `role: admin`

管理员能做的事：
- 读取 `users-index.json`（所有注册用户邮箱与状态）
- 启用/停用用户
- 删除或下架任意用户的公开文章
- 管理树形目录、AI 策略、系统设置

### 4.3 关于旧版「legacy」数据

WebBook 是从单用户版本迁移过来的。旧数据路径 `data/tree.json` + `data/notes/` 仍存在。

- 新用户登录后会自动将旧数据合并到自己的用户目录（幂等，可重复执行）
- 合并后 legacy 树的 public 节点会被 prune，避免在广场重复展示
- 管理员可在后台删改 legacy 公开内容
- **旧私密笔记**如果还在 `data/notes/` 里，理论上可能通过 noteId 被读到——这是已知的残留安全边界（详见 §七）

---

## 五、API 总览

### 5.1 公开（无需登录）

| 路径 | 返回 |
|------|------|
| `GET /api/public/feed` | 全站所有公开笔记列表（标题 + 摘要 + 邮箱） |
| `GET /api/public/square` | 同上，随机排序推荐 |
| `GET /api/public/tree` | 公开目录结构 |
| `GET /api/public/bloggers` | 有公开文的博主目录（含邮箱） |
| `GET /api/public/users/{userId}/feed` | 某用户的公开笔记列表 |
| `GET /api/public/notes/{ownerId}/{noteId}` | 单篇公开笔记全文 |
| `GET /api/public/notes/{noteId}` | 通过 noteId 自动查找 owner（兼容旧版） |
| `GET /api/public/notes/.../comments` | 公开笔记的评论 |
| `POST /api/public/notes/.../comments` | 发布评论（可游客） |
| `GET /api/link-preview?url=` | 抓取网页 OG 信息（⚠️ 未鉴权） |

### 5.2 用户（需登录 JWT）

| 路径 | 作用 |
|------|------|
| `GET /api/tree` | 读自己的完整目录（含 private 节点），响应带 `_rev`（当前 revision） |
| `PUT /api/tree` | 保存目录结构；**必须**带 `baseRev`（无该字段返回 400 `missing_baseRev`），revision 不符返回 409 `conflict` |
| `GET /api/tree/history` | 目录树版本历史（最新在前，最多 30 条） |
| `GET /api/tree/versions/{sha}` | 某个历史版本的目录树 |
| `GET /api/notes/{id}` | 读笔记 |
| `PUT /api/notes/{id}` | 保存笔记（触发云同步 + AI 策略） |
| `DELETE /api/notes/{id}` | 删笔记 |
| `GET /api/notes/{id}/history` | 版本历史列表 |
| `GET /api/notes/{id}/versions/{sha}` | 某版本内容 |
| `GET /api/plan` | 任务规划（整棵计划树 + `baseSha`） |
| `PUT /api/plan` | 保存规划（带 `baseSha`，冲突返回 409） |
| `POST /api/assets/upload` | 上传图片 |
| `POST /api/ai/chat` | AI 对话（含笔记上下文） |
| `POST /api/ai/run` | AI 动作（总结） |
| `GET /api/ai/providers` | 节点生成：按密钥列出可用模型 |
| `POST /api/ai/generate` | 节点生成：文 / 图（等） |
| `POST /api/migrate/legacy` | 手动触发旧数据迁移 |

### 5.3 圈子（需登录 + 是成员）

| 路径 | 权限 |
|------|------|
| `GET /api/circles` | 我的圈子列表 |
| `POST /api/circles` | 创建圈子 |
| `GET /api/circles/discover` | 发现公开圈子 |
| `POST /api/circles/{id}/join` | 申请加入 |
| `POST /api/circles/{id}/accept` | 圈主审批 |
| `GET /api/circles/{id}/feed` | 圈子博客 feed |
| `GET /api/circles/{id}/member-blog/{uid}/{nid}` | 读成员的圈内笔记 |
| `PUT/GET/DELETE /api/circles/{id}/notes/{nid}` | 协作笔记 CRUD（写需 collabEdit） |
| `GET/PUT /api/circles/{id}/tree` | 协作目录树 |
| `PATCH /api/circles/{id}/collab` | 开/关自己的编辑权限 |
| `POST /api/circles/{id}/invites` | 邀请成员（圈主） |
| `DELETE /api/circles/{id}/members/{uid}` | 踢人 / 退出 |

### 5.4 管理员（需 role: admin）

| 路径 | 作用 |
|------|------|
| `GET /api/admin/users` | 用户列表 |
| `PATCH /api/admin/users/{id}` | 启用/停用 |
| `GET /api/admin/settings` | 系统设置 |
| `PUT /api/admin/settings` | 保存设置 |
| `GET /api/admin/ai-strategies` | AI 策略列表 |
| `PUT /api/admin/ai-strategies` | 保存策略 |
| `GET /api/admin/public-notes` | 全站公开笔记 |
| `PATCH /api/admin/notes/{ownerId}/{noteId}` | 下架公开笔记 |
| `DELETE /api/admin/notes/{ownerId}/{noteId}` | 删除公开笔记 |
| `PATCH /api/admin/users/{id}` | 停用用户 |

### 5.5 补充（近期新增，未归入上文）

| 路径 | 作用 |
|------|------|
| `GET /api/storage/volumes` · `POST /api/storage/volumes/ensure` | 资产分卷清单 / 确保当前分卷 |
| `GET /api/assets/vol-xx/name` | 分卷资产读取（兼容旧 `/api/assets/name`） |
| `GET /api/feishu/status` · `GET /api/feishu/oauth/start` · `GET /api/feishu/oauth/callback` · `DELETE /api/feishu/oauth` | 飞书状态 / OAuth 授权 / 取消 |
| `GET /api/feishu/folders` · `POST /api/feishu/export` | 飞书目录 / 导出（Markdown zip） |
| `GET /api/ai/jobs/:id` | 异步生成任务轮询（文图视频3D） |

### 5.6 手机伴侣（需登录，数据仅本人可见）

详见 §十一。路径都在 `data/users/{userId}/` 下，不经由任何 `/api/public/*` 出口。

| 路径 | 作用 |
|------|------|
| `GET`/`POST /api/notify` | 提醒列表 / 创建 |
| `PATCH`/`DELETE /api/notify/:id` | 修改 / 删除（**不含送达回写**） |
| `GET /api/notify/due?windowDays=7` | 窗口内待触发实例（重复规则已展开）+ 已错过项 |
| `POST /api/notify/:id/delivered` | 送达回写——**只有这个端点能写 `notifiedAt`** |
| `POST /api/tracking/usage/sync` · `GET /api/tracking/usage` | 使用统计上报 / 读取（`?date=` 或 `?from=&to=`） |
| `GET /api/tracking/usage/dates` · `DELETE /api/tracking/usage` | 已有日期列表 / 清理区间 |
| `POST /api/tracking/expenses/bulk` | 批量提交（服务端一次 merge，并做规则/AI 归类） |
| `GET /api/tracking/expenses?month=` | 月度汇总 + 明细 + 规则 |
| `PATCH`/`DELETE /api/tracking/expenses/:id` | 改类别（并沉淀规则）/ 删误记 |

---

## 六、一次完整的「让所有人访问到」链路

```
用户打开 https://heyuan-cyber.github.io/webbook/
        │
    DNS 解析 → GitHub 的 CDN 节点（全球加速）
        │
    浏览器下载 index.html + app.js + style.css
        │
    React 应用在浏览器启动
        │
        ├── supabase.auth.getSession()     ← 恢复登录状态（4 秒超时 → 游客）
        │
        ├── GET /api/public/tree           ← 游客：只看公开文章列表
        │       └─ Worker → 读所有人的 tree.json → 过滤 public → 返回
        │
        ├── GET /api/public/feed           ← 博客广场文章列表
        │       └─ Worker → 遍历所有用户目录 → 收集 public 文章 → 返回
        │
        └── 用户点击文章 →
                GET /api/public/notes/{userId}/{noteId}
                    └─ Worker → 读 data/users/{userId}/notes/{noteId}.json
                    → 检查 visibility==='public' → 返回全文 → 渲染
```

**没有一台「你的服务器」在跑。** 四个免费云服务接力完成：

| 步骤 | 用了什么服务 | 提供什么 |
|------|-------------|---------|
| 1 → 2 | GitHub Pages | 静态文件 CDN |
| 3 → 4 | 浏览器（你电脑） | 执行 React 代码 |
| 5 → 7 | Supabase | 登录认证、发 JWT |
| 8 → 11 | Cloudflare Worker | 业务逻辑、鉴权、读 GitHub |
| 12 | GitHub API | 读写私有仓 JSON 文件 |

---

## 七、安全与隐私

### 7.1 数据暴露面

| 暴露内容 | 暴露范围 |
|----------|---------|
| 公开笔记全文 | 互联网任何人（通过 `/api/public/*`） |
| 公开笔记标题/摘要 | 互联网任何人 |
| 用户邮箱（UUID） | `/api/public/feed`、`/api/public/bloggers`——有邮箱字段 |
| 圈子成员关系 | 同圈成员互相可见邮箱 |
| 公开圈子基本信息 | 互联网任何人（名称、描述、圈主邮箱、成员数） |
| JWT 令牌 | 你的浏览器（localStorage / 内存） |
| 私密笔记 | 仅自己（JWT + 路径匹配） |
| 圈内笔记 | 仅圈成员（JWT + isMember） |

### 7.2 已知风险（当前未修复）

| 风险 | 影响 | 建议 |
|------|------|------|
| **公开 API 无限流** | 脚本可批量爬取所有公开笔记和邮箱 | 在 Cloudflare 控制台设置 Rate Limiting（免费规则） |
| **邮箱暴露在 feed** | 博客广场、博主目录暴露注册邮箱 | 改为昵称/随机 ID 对外显示 |
| **link-preview 未鉴权** | 不需要登录即可让 Worker 代为请求任意 URL（SSRF） | 加 `if (!user) return unauthorized()` |
| **Legacy 兼容层越权** | 新用户登录后自动触发 legacy 迁移，可能读到旧私密笔记 | 见 §4.3；本质是单用户到多户的过渡问题 |
| **circle 笔记未绑圈 ID** | 同一篇 `circle` 笔记会出现在用户加入的所有圈子 feed 中 | per-note `circleId` 绑定（当前无此字段） |
| **CORS 全开放** | 任何域名都可调 API | 可限制为 `heyuan-cyber.github.io` |
| **无 WAF 防护** | 爬虫 / 攻击者无阻碍 | 可加 Cloudflare Turnstile（人机验证） |

### 7.3 安全实践（做对了的）

- 数据仓与代码仓分离（`webbook` 公开 / `webbook-data` 私有）
- 后端密钥（`GITHUB_TOKEN`、`AI_API_KEY`、`SERVICE_ROLE`）存在 Cloudflare Secret，不进 Git、不进前端
- 私密笔记在公开 API 返回 404（不是 403，不暴露存在）
- 圈子 API 双重校验：JWT + `isMember`
- 管理员邮箱两处一致（前端 `VITE_ADMIN_EMAIL` + Worker `ADMIN_EMAIL`）
- 停用的用户 API 返回 403

---

## 八、部署步骤

### 阶段 0：注册账号（均免费）

| 服务 | 用途 |
|------|------|
| GitHub | 代码仓 + 数据仓 + Pages |
| Cloudflare | Workers API |
| Supabase | 登录认证 |
| DeepSeek（可选） | AI |

### 阶段 1：GitHub 仓库

| 仓库 | 可见性 | 用途 |
|------|--------|------|
| `heyuan-cyber/webbook` | 公开 | 前端 + Worker 源码 |
| `heyuan-cyber/webbook-data` | **私有** | 笔记数据 |

### 阶段 2：Supabase

1. 新建 Project
2. Settings → API 复制 URL + `anon` / `service_role` key
3. Authentication → Providers 开启 Email
4. 开发期可关掉「Confirm email」

### 阶段 3：GitHub PAT

Fine-grained token，权限：

- Contents: Read and write（数据仓）
- Pages: Read and write
- Workflow: Read and write

### 阶段 4：部署 Worker

```powershell
cd workers/api
npx wrangler login
npx wrangler deploy

# 设置秘密（只需一次，之后更新 Worker 代码无需重复设）
"你的GITHUB_TOKEN" | npx wrangler secret put GITHUB_TOKEN
"你的AI_API_KEY"  | npx wrangler secret put AI_API_KEY
"你的SUPABASE_SERVICE_ROLE_KEY" | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### 阶段 5：部署前端

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**
2. `git push main`，`.github/workflows/deploy.yml` 自动构建

构建变量（已在 workflow 里设好）：

| 变量 | 值 |
|------|-----|
| `VITE_BASE_PATH` | `/webbook/` |
| `VITE_API_BASE_URL` | Worker 地址 |
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | 前端 anon key |
| `VITE_ADMIN_EMAIL` | 管理员邮箱 |

### 阶段 6：验证

| 检查 | 期望 |
|------|------|
| `https://heyuan-cyber.github.io/webbook/` | 欢迎页 |
| `https://webbook-api.../api/public/tree` | 返回 JSON |
| 管理员登录 `/admin` | 可进后台 |
| 登录后新建笔记 | `webbook-data` 出现 JSON |

---

## 九、本地开发

根路径 `/` 会重定向到 **`/app`**。日常地址：`http://localhost:5173/app`（博客 `/blog`，后台 `/admin`）。

复制 `.env.example` 为 `.env` 后，二选一：

### 模式 A（推荐）— 前端连已部署 Worker

```bash
cd WebBook
npm install
# .env: VITE_API_BASE_URL=https://webbook-api.1060707057.workers.dev
#       + VITE_SUPABASE_* （真登录）
npm run dev        # 仅前端；不必起 localhost:8787
```

### 模式 B — 全本地（改 Worker 时）

```bash
# .env: VITE_API_BASE_URL=http://localhost:8787
npm run dev        # 前端 http://localhost:5173
npm run dev:api    # API   http://localhost:8787（.dev.vars + [ai] binding）
```

| | 模式 A | 模式 B | 线上 |
|--|--------|--------|------|
| 前端 | Vite `:5173` | Vite `:5173` | GitHub Pages `/webbook/` |
| API | 已部署 Worker | `wrangler dev` | Cloudflare 边缘 |
| 数据 | GitHub 数据仓 | 同上 | 同上 |
| 认证 | 有 `VITE_SUPABASE_URL` → Supabase；否则 Mock | 同左 | Supabase |

未配置 Supabase 时自动 Mock + IndexedDB，可体验舞台；云同步与节点 AI 需要登录 + 可用的 API。

---

## 十、上线维护

| 改了什么 | 怎么上线 |
|----------|----------|
| 前端 `apps/web/**` | `git push` → GitHub Actions |
| Worker `workers/api/**` | `npx wrangler deploy`（或 `npm run deploy:api`） |
| 密钥 | `wrangler secret put <NAME>` |
| 管理员邮箱 | 改 `wrangler.toml` + `deploy.yml` 后前者 `wrangler deploy`，后者 `git push` |
| 仅数据仓笔记 | 在 App 里编辑保存即可，无需重新部署 |
| **Android 宿主 `apps/android-cap/**`** | `npm run android:companion`（见 §十四） |

> ⚠️ **Worker 必须显式部署才生效**。前端连的是线上 Worker；本地改完 `workers/api`
> 若只跑 `typecheck` 而不 `deploy`，线上仍是旧版本——**新路由会返回 404，而本地一切正常**。
> 这类"本地通过、线上 404"最容易误判成代码 bug。已实测过一次。

### 目录树并发语义变更的部署顺序（重要）

`PUT /api/tree` 由「无条件整树覆盖」改为「带 `baseRev` 的条件写」是一次**前后端耦合**的变更，
两侧必须一起上线。**先前端，后 Worker**：

```
1) git push 前端          ← 新前端拿到不含 _rev 的响应时会进入"本地模式"，
                            暂停目录写入并在界面明确提示（fail-closed）
2) npx wrangler deploy    ← Worker 开始返回 _rev 并要求 baseRev
3) 刷新页面               ← 目录同步恢复正常
```

**为什么不能反过来**：先部署 Worker 的话，旧前端仍在发不带 `baseRev` 的请求，会被 400 拒绝；
而旧前端的 `saveTree` 会吞掉这个错误，表现为"目录改动悄悄没保存"——正是这次要消灭的那类静默失败。
反过来先上前端则只是**短暂地拒绝写入并大声报错**，期间不会有数据被覆盖。

回滚同样安全：条件写只可能**阻止**写入，不会让数据卡在中间态。

---

## 十一、Android 宿主（Capacitor）

### 11.1 为什么不是 TWA

原 APK 是 **TWA**：它本质是 **Chrome 的一个标签页**，跑在 Chrome 进程内，应用自身
**不持有任何系统权限**。因此拿不到到点提醒、使用统计、通知监听这三类能力——
它们在 Web 沙箱里没有任何入口。

`apps/android-cap` 用 **Capacitor** 给同一个网页套一个**自有进程**，通过插件把系统能力
交给 Web 层。**网页端不重写**。TWA 工程 `apps/android-twa` 保留可用，作为回退路径。

### 11.2 加载方式：打包进包（不用 `server.url`）

`capacitor.config.ts` 的 `webDir` 指向 `../web/dist`，APK **自带网页**。

**为什么不远程加载**：远程路径走 `handleProxyRequest`，注入 bridge 有一个额外前提
（请求 `Accept` 头含 `text/html`）。条件不满足时**页面照常渲染，只是
`window.Capacitor` 为 undefined** —— 所有原生能力静默失效，界面上看不出错。
本地资产路径按扩展名判定、无条件注入，且已真机验证。

**代价**：网页改动需重新出包。换来离线可用、启动更快、不依赖 Pages 可达性。

### 11.3 构建

```powershell
npm run android:companion           # 自动构建 apps/web 再打包
npm run android:companion:probe     # 出诊断探针包（排查原生能力用）
```

产物在 `apps/android-cap/dist/`。debug 包用 Android 默认调试签名，包名
`io.github.heyuan_cyber.webbook`，**与既有 TWA（`.twa`）包名不同，可并存安装**。

> **两个踩过的坑**：
> 1. `@capacitor/app` 这类插件必须同时装在 **`apps/android-cap`**（原生侧靠它发现插件）。
>    只装 `apps/web` 会导致前端代码进了包、`capacitor.plugins.json` 却是空的——
>    表现为"代码在但插件不存在"的静默失败。
> 2. `cap copy` 必须在 `apps/android-cap` 目录下执行，否则报
>    `android platform has not been added yet`。

### 11.4 四个权限

都需要**在系统设置里手动授予**，且互相独立（缺一项只影响对应功能）。

| 权限 | 路径 | 缺失后果 |
|------|------|----------|
| 使用情况访问 | 设置 → 特殊应用权限 → 使用情况访问 | 使用统计拿不到数据 |
| 通知使用权 | 设置 → 通知 → 通知使用权 | 支付不被记录 |
| **通知展示权限** | 设置 → 应用 → WebBook → 通知 | **提醒会响，但你收不到** |
| 精确闹钟 | 设置 → 应用 → WebBook → 闹钟和提醒 | 提醒可能被延迟数分钟 |

> **通知展示权限**在真机（小米 23049RAD8C / Android 15）上默认被拒。此时闹钟照常触发、
> `AlarmReceiver` 照常执行，但 `nm.notify()` 抛 `SecurityException`——**用户什么都看不到**。
> 排程成功、触发成功、结果为零，是最难排查的一类失效。因此提醒页会在该状态下显示醒目提示。

**两个不会报错的坑**：
- 未授予通知使用权时，系统**根本不绑定**监听服务且不报错。代码里"已授权"与"已连接"
  必须分开检查，否则会把"没授权"误判成"监听坏了"。
- `PACKAGE_USAGE_STATS` 是**特殊权限**（AppOps），`uses-permission` 只是声明，
  不去系统设置里开就永远拿不到数据。

### 11.5 数据仓新增目录

```
data/users/{userId}/
├── notify.json              ← 到点提醒（**不是** reminders.json，见下）
├── usage/
│   ├── 2026-09-25.json      ← 一天一个分片
│   └── 2026-09-26.json
└── expenses/
    ├── 2026-09.json         ← 一个月一个分片
    └── rules.json           ← 商户 → 类别 规则
```

**为什么提醒不用 `reminders.json`**：那个文件归 `webbook-node-planner` 的规划迁移所有。
其 `mergeReminders` 的过滤器是「有 `id` 且有 `text`」，会在用户首次加载 `/api/plan`
时把命中的条目**永久**并入 `plan.json`（无论有无条目都会落下 `migratedReminders` 标记，
因此污染不可逆）。共用文件会让新版提醒被静默吞成规划任务。

**为什么按天/月分片**：唯一持久层是 GitHub Contents API（逐文件读改写，每次写入产生一个
commit）。单文件方案每次追加都要读写全部历史；分片则新增一天/一月不触碰既有分片。

### 11.6 新增 API

| 路径 | 作用 |
|------|------|
| `GET /api/notify` · `POST /api/notify` | 提醒列表 / 创建 |
| `PATCH /api/notify/:id` · `DELETE /api/notify/:id` | 修改 / 删除（**不含送达回写**） |
| `GET /api/notify/due?windowDays=7` | 窗口内待触发实例（重复规则已展开）+ 已错过项 |
| `POST /api/notify/:id/delivered` | **送达回写**——只有这个端点能写 `notifiedAt` |
| `POST /api/tracking/usage/sync` · `GET /api/tracking/usage` | 使用统计上报 / 读取 |
| `GET /api/tracking/usage/dates` · `DELETE /api/tracking/usage` | 已有日期 / 清理区间 |
| `POST /api/tracking/expenses/bulk` | 批量提交（服务端一次 merge + 归类） |
| `GET /api/tracking/expenses` · `PATCH`/`DELETE /:id` | 月度汇总 / 改类别 / 删误记 |

> **为什么送达回写单独一个端点**：若把 `notifiedAt` 放进通用 `PATCH`，客户端就能伪造
> "已送达"——那"已排程 vs 已送达"的区分（spec 明确要求）就失去意义了。

---

## 十二、费用估计

| 服务 | 免费额度 | 个人够用？ |
|------|----------|-----------|
| GitHub Pages | 公开站免费 | ✅ |
| GitHub 私有仓 | 免费 | ✅ |
| Cloudflare Workers | 10 万请求/天 | ✅ |
| Supabase | 5 万 MAU | ✅ |
| DeepSeek | 按量，有免费额度 | ✅ 轻度使用 |

---

## 十三、代码地图

```
WebBook/
├── apps/web/                          # 前端：React + Vite PWA（GitHub Pages）
│   ├── src/auth/                      #   Supabase + Mock 认证（AuthContext / provider）
│   ├── src/components/                #   AppShell、树形目录、编辑器、圈子、评论、AI 面板、历史、飞书
│   │   └── editor/                    #   统一舞台编辑器（绝对定位块+连线+画布、BlockEditor、SlashMenu…）
│   ├── src/pages/                     #   /app、/blog*、/admin、/login、/circles*
│   ├── src/lib/                       #   api.ts（统一 http 客户端）、blog、feishuZipIo、markdown、storage、publicDefaults
│   ├── src/store/                     #   useNotesStore / repository / useToastStore
│   └── src/styles/                    #   global.css / layout.css
├── workers/api/src/                   # 后端：Cloudflare Worker（全部业务逻辑 + JWT 鉴权）
│   ├── index.ts                       #   路由入口 + CORS
│   ├── auth.ts                        #   JWT 校验（Supabase）+ 管理员判定
│   ├── github.ts                      #   GitHub Contents API 读写（JSON / 二进制·分卷）
│   ├── userData.ts                    #   用户笔记 / 树 读写
│   ├── usersRegistry.ts               #   注册用户索引
│   ├── publicFeed.ts                  #   公开 feed / 广场 / 博主
│   ├── tree-filter.ts                 #   可见性过滤
│   ├── circles.ts                     #   圈子逻辑（创建/加入/审批/协作/feed/成员）
│   ├── circleData.ts                  #   圈子 树 / 协作笔记 读写
│   ├── comments.ts                    #   文章评论（公开 + 登录）
│   ├── plan.ts                        #   任务规划（单文件 + 乐观锁）
│   ├── assets.ts / volumes.ts         #   资产上传 / 分卷存储（40MB 上限、registry）
│   ├── aiStrategies.ts                #   AI 策略（保存后总结等）
│   ├── migrateLegacy.ts               #   旧版单用户 → 多用户 迁移
│   ├── feishu.ts                      #   飞书 OAuth + 导出 / zip 导入
│   ├── admin.ts / adminContent.ts     #   管理员接口 / 公开内容审核
│   ├── ai.ts                          #   chat / run
│   ├── ai/                            #   对话工具 + 联网 + 节点生成
│   │   ├── chatWithTools.ts / jobs.ts #   工具化对话 / 异步生成任务
│   │   ├── generateProviders.ts       #   providers 目录与 generate 分发
│   │   ├── adapters/                  #   DeepSeek 文、CF/OpenAI/Gemini/Seedream 图、Seedance 视频、Tripo 3D
│   │   └── tools/                     #   webSearch / rss / research / mergeNews
│   └── env.ts                         #   环境变量类型
├── packages/shared/                   # 共享数据模型 + 数据仓路径
│   └── src/                           #   note / tree / circle / blocks / comment / paths / migrateBlocks
├── apps/android-twa/                  # TWA APK 工程
├── user-pages/                        # 入口站 + 域名根 assetlinks
├── scripts/                           # 初始化 / 迁移 / APK / 部署 / 冒烟
└── .github/workflows/                 # deploy.yml（前端 Pages）+ deploy-user-pages.yml
```

建议学习顺序：`packages/shared` 看数据模型 → `workers/api/src/index.ts` 看路由 → `workers/api/src/github.ts` 看数据如何落地 → `apps/web/src/lib/api.ts` 看前端如何调 API。

---

## 十四、术语速查

| 术语 | 一句话 |
|------|--------|
| SPA | 单页应用，一个 HTML 壳，切换页面不整页刷新 |
| JWT | JSON Web Token，无状态登录凭证，后端验签名即可 |
| Serverless | 无服务器，按请求执行，不用租 VPS |
| CDN | 内容分发网络，静态文件靠近用户缓存 |
| PAT | GitHub 个人访问令牌，程序化访问仓库 |
| BFF | Backend For Frontend，给前端定制的后端聚合层 |
| PWA | 渐进式网页应用，可安装、可离线 |
| TWA | Android 全屏信任网页容器 |
| IndexedDB | 浏览器里的大容量结构化存储 |
| CI/CD | 持续集成/部署，push 代码自动构建上线 |
| CORS | 跨域资源共享，控制哪个域名可以调你的 API |
| SSRF | 服务端请求伪造，攻击者让后端代发恶意请求 |

---

## 十五、当前线上地址

| 项目 | 地址 |
|------|------|
| 用户端 | `https://heyuan-cyber.github.io/webbook/app` |
| 管理后台 | `https://heyuan-cyber.github.io/webbook/admin` |
| 博客广场 | `https://heyuan-cyber.github.io/webbook/blog` |
| API | `https://webbook-api.1060707057.workers.dev` |
| 代码仓 | `https://github.com/heyuan-cyber/webbook` |
| 数据仓 | `heyuan-cyber/webbook-data`（私有） |
