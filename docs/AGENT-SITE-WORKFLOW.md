# Agent Workflow — 个人主页多标签站点（web-ui site）

> 给其他 agent（或人）快速接手 WebBook 个人主页这块的前置知识。
> 关注点：架构、数据流、backend 契约、部署状态、以及几个会踩的坑。

## 1. 这是什么

WebBook 个人主页 `UserBlogPage`（路由 `/blog/u/:userId`）从「单页滚动」重构成 **state 驱动的多标签站点**：
- 首页（Home，默认）：沉浸式 cinematic hero，滚动吸附，滚到底自动切「项目示例」。
- 项目示例（Work）：从站点配置读取笔记，bento 大卡展示。
- 博客（Blog）：按笔记类别分组的文章卡。
- 设置（Settings）：**仅站主可见**，指派哪些笔记进哪个区域，存到 `profile.site`。

tab 由 `activeTab` state 切换，**无 URL 变化**。

## 2. 目录 / 文件地图

```
apps/web/src/pages/UserBlogPage.tsx      # 站点容器：取 feed + site，持有 activeTab，渲染某 tab
apps/web/src/pages/site/HomeTab.tsx      # 首页：scroll-snap + 粒子 canvas + 滚到底自动切 tab
apps/web/src/pages/site/WorkTab.tsx      # 项目示例：bento 大卡
apps/web/src/pages/site/BlogTab.tsx      # 博客：按类别分组的卡片
apps/web/src/pages/site/SettingsTab.tsx  # 设置：指派 work/blog note ids + 类别顺序，保存 site
apps/web/src/pages/site/shared.tsx       # resolveIds / groupByCategory / NoteCard
apps/web/src/components/ArticleToc.tsx   # 文章右侧 TOC（heading level 1-3）
apps/web/src/components/blog/BlogArticleView.tsx  # 给 heading 加 id 供 TOC 锚点
apps/web/src/lib/api.ts                  # SiteConfig 类型 + loadSiteConfig/saveSiteConfig
apps/web/src/lib/blog.ts                 # 路径/格式化 helpers
apps/web/src/styles/layout.css           # 站点/首页/work/blog/settings/TOC 全套样式 (.io-*)
workers/api/src/userProfile.ts           # UserProfile.site (SiteConfig)
workers/api/src/index.ts                 # /api/profile/site (PUT) + /api/public/users/:id/site (GET) + feed 带 site
```

## 3. 数据流（backend contract）

个人主页的数据来自 `apiClient.loadUserPublicFeed(userId)`，返回：
```ts
{
  ownerId, ownerEmail,
  posts: PublicFeedItem[],        // noteId/title/summary/category/cover/updatedAt
  featuredNoteId?: string,        // 保留（未再使用）
  site?: SiteConfig | null,       // 各区域指派
}
```

`SiteConfig`：
```ts
interface SiteConfig {
  workNoteIds?: string[];        // 项目示例区（有序）
  blogNoteIds?: string[];        // 博客区（有序）
  blogCategoryOrder?: string[];  // 博客类别顺序（未设则按 category）
}
```

### Backend 端点
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/public/users/:id/site` | 公开读站点配置（无需登录） |
| PUT | `/api/profile/site` | 站主写配置（需 `Bearer` token，写到自己的 `profile.json`） |
| GET | `/api/public/users/:id/feed` | 用户 feed，**现在返回 `site` 字段** |

存储位置：`data/users/{userId}/profile.json`（经 GitHub Contents API，通过 `loadUserProfile`/`saveUserProfile` 复用）。

**关键：新增端点需 `wrangler deploy` 才会在线上生效。** 本地 `wrangler dev`（mode B）会加载最新代码；已部署的线上 worker（`webbook-api.1060707057.workers.dev`）只有 deploy 后才含新端点。

## 4. 部署状态

- 当前部署版本：`5e3a7d30-bc94-43a5-be6c-fac52fdec384`（已含 `/api/profile/site` 等）。
- 部署命令：`cd workers/api && npx wrangler deploy`。
- **注意**：`wrangler deploy` 需要 Cloudflare 授权；本沙盒需 `danger-full-access` 才能跑 esbuild 子进程，否则 `spawn EPERM`。

## 5. 测试 / 运行

前端 + 本地后端：
```powershell
cd E:\Demo\WebBook
npm run dev            # 前端 Vite :5173
npm run dev:api        # 本地 worker :8787 (mode B)
```
- `apps/web/.env`：`VITE_API_BASE_URL` 决定前端连哪。
  - 本地 = `http://localhost:8787`（mode B，你本机有 GitHub 访问才能取到真实数据）。
  - 线上 = `https://webbook-api.1060707057.workers.dev`（mode A，访客用的路径）。
- 个人主页 URL：`/blog/u/<userId>`。

## 6. 已知坑（务必注意）

1. **Vite 会因 `.tmpdir` 崩（EBUSY）**：编辑器/工具原子写产生的 `*.tmpdir` 临文件会触发 Vite watcher `EBUSY` 崩溃。修复：清掉 `apps/web/src` 下的 `*.tmpdir`，重启 `npm run dev`。**不要**把它当代码 bug。
2. **本文沙盒的网络限制**：GitHub API、`api.github.com`、`.workers.dev`、Cloudflare 在受限沙盒**不可达/不稳定**。所以：
   - 数据拉取（真实笔记）在沙盒里拿不到 → 视觉/数据验证要在有网络的本机做。
   - `git push` 需要真实 GitHub 凭证，沙盒的 Windows Credential Manager 可能交不出 token（`SEC_E_NO_CREDENTIALS`）或 `Could not resolve host`。本机执行 `git push origin main`。
3. **首页滚动容器**：`.io-site` 是站点自己的滚动容器（`height:100%; overflow-y:auto`），首页内部再套 `.io-home-scroller`（`scroll-snap-type:y mandatory`）。改滚动时别把 `html/body` 锁成 100% 高度导致无法滚动。
4. **full-width vs 920px**：`.io-site-content` 已改为全宽（`width:100%; max-width:none`），不要让它继承 `.blog-main` 的 `max-width:920px`，否则 hero 出现左右黑边。
5. **`shared.ts` 必须叫 `shared.tsx`**：它含 JSX，`.ts` 后缀会报 JSX 语法错。
6. **设置焦点（featured）已从前端移除**：`NoteEditor` 不再有「★ 焦点」按钮；但 `setFeaturedNote` API 和 worker `/api/profile/featured` 端点**保留未删**（未部署改动）。如需彻底移除，需同步删后端并 deploy。

## 7. OpenSpec 工作流（如果继续走 spec-driven）

- 涉及个人主页/站点的 spec delta 在 `openspec/specs/web-ui-personal-site/`、`web-ui-site-config/`、`web-ui-product-polish/`、`web-ui-article-experience/`。
- 命令：`openspec new change <name>` → 写 proposal/specs/design/tasks → `openspec validate --changes <name>` → `/openspec-apply-change` 实现 → `/openspec-archive-change <name>` 归档（把 delta 合并进主 spec）。
- **注意**：根 `.gitignore` 已排除 `openspec/`（不进仓库）。若要让另一台机器能跑 openspec 工作流，需手动允许提交 `openspec/`（本项目当前选择不入库）。

## 8. 建议的操作顺序（新 agent 接手）

1. 读 `UserBlogPage.tsx` + `site/*.tsx`（理解 tab 结构）。
2. 读 `userProfile.ts` + `index.ts` 的 site 路由（理解数据契约）。
3. `npm run typecheck -w apps/web` 与 `-w workers/api` 验证改动。
4. 本地 `npm run dev` + `npm run dev:api`，浏览器开 `/blog/u/<userId>`。
5. 改完后 `git add` + `commit` + 在你本机 `git push origin main`。
