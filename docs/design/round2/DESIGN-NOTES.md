# WebBook 界面美化 · 二阶段设计稿「一体外壳」

> **设计稿入口：双击 `docs/design/round2/INDEX.html`**（纯静态 HTML/CSS，不需要 dev server）
>
> 这一份是**给你看的设计稿 + 决策清单**，不是实现方案，也没有改任何产品代码。
> 上一轮的方向选择与 token 规格在 `docs/design/UI-REFRESH-AUDIT.md` 与 `docs/design/mockups/`。

---

## 1. 为什么还有第二轮

上一轮（方向一 · 墨金）解决的是**皮肤**，而且完成度很高，已经落地：

| 已完成 | 证据 |
|---|---|
| 完整 token 体系（尺度层 + 语义层 + 场景层） | `apps/web/src/styles/global.css:109-207` |
| 三套皮肤 `gold / paper / blueprint`，颜色只有一个来源 | `apps/web/src/styles/theme.css` |
| 53 个线性 SVG 图标替换全部 emoji | `apps/web/src/components/Icon.tsx:18-72` |
| 画布去冷蓝，连线改成暖金 | `theme.css:66-75` |
| 字号 / 圆角 / 阴影接入 token，侧栏缩进 14→10px | `layout.css` |

**这一轮要解决的是结构，不是皮肤。** 实测（`localhost:5188` headless Chrome）暴露出的问题全部属于下面四类：

| # | 问题 | 硬证据 |
|---|---|---|
| 1 | **只有 2/14 个路由有外壳** | `App.tsx:46-61` 对 `AppShell.tsx:17` —— 唯一消费者是 `UserApp.tsx`。`/blog`、`/blog/u/*`、`/app/circles`、`/admin` 全部裸奔 |
| 2 | **顶栏 7 个平级按钮，无 active 态** | `AppShell.tsx:105-139`；全仓 grep `NavLink` / `aria-current` 零命中；游客也能看到「后台」 |
| 3 | **游客进圈子迎面一个登录页** | headless 实测 `/app/circles` 渲染 `.auth-page`，截图与 `/login` **逐字节相同** |
| 4 | **首屏是死灰色** | `_before/01-app-desktop.png`：1600×1000 里 90% 是空的，只有居中两行提示 |
| 5 | **手机端顶栏被挤空 + 文字溢出** | `_before/04-app-mobile.png`：只剩「游客模式 / 社区」；空态说明文字切在屏幕右边缘外 |
| 6 | **8 套弹窗背板 + 6 处原生 confirm** | `CommandPalette` / `TreeHistoryPanel` / `NoteHistoryPanel` / `ImageCropModal` / `ImageLightbox` / `md-help-dialog` / `feishu-export-modal` / `PlanTaskTree`；`AdminPanel.tsx:115,131`、`useNotesStore.ts:344`、`LoginPage.tsx:29`、`TreeSyncNotice.tsx:37`、`TreeHistoryPanel.tsx:85` |
| 7 | **4 套 Tabs，其中一套没有 ARIA** | `BlogHubPage.tsx:164-187` / `CircleDetailPage.tsx:156-171`（无 `role="tab"`）/ `AdminPanel.tsx:62-78` / `UserBlogPage.tsx:124,134,143` |
| 8 | **加载态两套标准** | Skeleton 只在博客面（4 处）；其余 15+ 处是裸 `<p>加载中…</p>` |
| 9 | **层级几乎不可见** | 相邻表面档只差 4~6/255（`#14161a → #1a1d23 → #1f232a`），侧栏与内容只靠一条 14% 白线分开 |

---

## 2. 设计稿的答案

### 2.1 一个外壳：左轨道（去处）+ 侧栏（内容）+ 情境顶栏

```
┌────┬──────────────┬─────────────────────────────────────┐
│    │              │  面包屑 ▸          ⌘K      操作     │  ← 情境顶栏 52px
│ 📓 ├──────────────┼─────────────────────────────────────┤
│ 📰 │              │                                     │
│ 👥 │   目录树      │            舞台 / 正文               │
│ 👤 │  （只管内容） │                                     │
│    │              │                                     │
│ ✨ │              │                                     │
│ ⚙  │              │                                     │
│ 何 │              │                                     │
└────┴──────────────┴─────────────────────────────────────┘
 68px    268px                    flex
```

- **左轨道 68px** 承担导航：笔记 / 博客 / 圈子 / 我 + AI / 皮肤 / 头像。当前项 = 金色药丸 + 左侧 3px 发光条。圈子带未读角标。
- **侧栏 268px** 只装内容：目录树；`/blog` 下是分类与博主；`/admin` 下是管理子导航。
- **顶栏情境化**：左面包屑（可点回上级）、中 ⌘K、右同步状态 + 页面操作。
- 14 个路由**全部**走进同一个外壳 —— 这是「一个产品」的最低要求。

### 2.2 一个首屏

把 `/app` 第一次打开的居中灰字换成：一句主标题 + 一个可直接聚焦的书写条 + 3 个动作 + 右侧「快速开始 / 最近打开」。

### 2.3 一套零件

Dialog / Tabs / Skeleton（3 种）/ EmptyState / Toast / Button 各一个。替换掉 8 套弹窗、4 套 tab、15+ 处裸加载文字、6 处 `window.confirm`。

### 2.4 视觉上真正让它变好看的四件事

| 做法 | 为什么 |
|---|---|
| **把表面层级差值拉开**（相邻档 +6/255，卡片加 `inset 0 1px 0 rgba(255,255,255,.045)`） | 现在面板「浮」不起来，只靠一条发丝线分界 |
| **卡片自动封面**（从 `note.id` 派生确定性渐变，零数据改动） | 没有 `cover` 的卡片是一片灰，列表视觉重量全靠运气 |
| **元信息全部走等宽字**（日期 / 计数 / SHA / 路径） | 等宽元信息会「退后」，不再和内容抢注意力 |
| **收紧首屏留白节奏**（8px 基线；区块 24/32/48） | 现在内容挤在 760px 列里，宽屏右侧 40% 全空 |

---

## 3. 设计稿文件

| 文件 | 内容 |
|---|---|
| **`INDEX.html`** | **入口**：诊断、现状实拍、五份设计稿导航、需要拍板的 4 个问题 |
| `screen-01-notebook.html` | 笔记本：首屏 + 笔记态（新外壳、面包屑、笔记头两层） |
| `screen-02-public.html` | 博客广场 / 个人主页 / 文章（共用外壳、1180px、自动封面） |
| `screen-03-circles-admin.html` | 圈子 / 后台（游客可读、Dialog 替 confirm、侧栏子导航） |
| `screen-04-mobile.html` | 移动端四屏（底部导航、悬浮新建、空态限宽） |
| `screen-05-parts.html` | 零件收口清单 |
| `r2.css` | 设计稿共用样式（token 值与 `theme.css` 一致，所以看到的颜色 = 落地后的颜色） |
| `_before/*.png` | 现状实拍 12 张（`localhost:5188`，headless Chrome，非示意图） |

---

## 4. 需要拍板的四件事

| # | 问题 | 推荐 |
|---|---|---|
| **Q1** | 导航放哪儿？ | **A. 左轨道 + 内容侧栏**（B 顶上拉菜单 / C 顶栏 tab 化） |
| **Q2** | 首屏做成什么样？ | **A. 书写条优先**（B 三个大按钮 / C 简化空态） |
| **Q3** | 卡片要不要自动封面？ | **A. 按 id 派生确定性渐变**（B 首字封面 / C 不加） |
| **Q4** | 落地节奏？ | **A. P0→P4 逐步验收**（B 只做外壳+移动端 / C 先做一块样板） |

---

## 5. 建议的落地顺序（确认后）

| 阶段 | 内容 | 可独立验收 |
|---|---|---|
| **P0** | 外壳骨架：`AppShell` 增加 rail 与顶栏变体，把 `/blog`、`/blog/u/*`、`/app/circles`、`/admin` 接进来；加 active 态；后台入口只对 admin 显示 | 从笔记跳到博客不再像换产品；游客进圈子不再撞登录墙 |
| **P1** | 首屏 + 空态 + 加载态：首屏写作条；`EmptyState` / `Skeleton` 铺到笔记本、圈子、后台 | 冷启动第一眼不再空白 |
| **P2** | 移动端：底部导航 + 悬浮新建（PRD `U-03`）+ 空态限宽 26ch | 390px 下顶栏不再被挤空、无横向裁切 |
| **P3** | 零件收口：`<Dialog>` 替 6 处 confirm；`<Tabs>` 4→1 并补 ARIA；清 `🎨` / `✓` | 交互一致性 |
| **P4** | 样式表瘦身：删 4 代首页残留（约 700–900 行）与孤儿页 `BlogPage.tsx` | 改样式不再改到死代码 |

---

## 6. 明确不动的

- **配色**：三套皮肤已是确认过的方向，只拉开层级差值，色相一个不改。
- **画布 / 块编辑器内核**：块、连线、相机、手势的数据模型与交互不改。
- **数据与 API**：零 schema 改动、零 Worker 部署。自动封面是 CSS，不是新字段。
- **权限与可见性**：private 仍然返回 404；游客在圈子页看到的是**公开圈子**，与现有 `/api/public` 能力一致。

---

## 7. 顺带发现（不属于美化范围，需单独决策）

### 7.1 个人主页读不到自己的公开文（疑似后端 bug）

```
GET /api/public/feed
  → posts[0].ownerId = ac061a21-5b4e-9d-abdd-5547a6fce927   （有 1 篇）

GET /api/public/users/ac061a21-5b4e-9d-abdd-5547a6fce927/feed
  → {"ownerId":"ac061a21-…","ownerEmail":"ac061a21-…","posts":[],"site":null}
```

同一 `ownerId` 在广场里有文章、在个人页 feed 里是空数组；且返回的 `ownerEmail` 等于 userId（邮箱没解析出来）。
结果：个人主页对**有公开文章的作者**也渲染「还没有文章」。建议单独开 issue 定位。

### 7.2 舞台初始相机偏移（上一轮已记录，仍未修）

新建 / 未拖动过的笔记打开后，正文偏到视口右侧之外，只看到左半截文字。这是当前最伤体验的既有 bug，优先级建议高于本轮美化。

### 7.3 样式表四代同堂

`layout.css` 5,675 行里同时躺着 `blog-*` + `domain-*`/`spotlight-*`/`marquee`/`masonry`（~487 行）、老 `io-hero-*`/`io-spot-*`/`io-home-*`/`io-discipline*`/`io-work-*`/`io-blog-*`（零 TSX 引用）、`io-site-*`（在用的）、`swiss-*`（在用的覆盖层）。
陷阱在于：改「卡片长什么样」时改前一段不会有任何效果。建议 P4 统一清理前先 grep 复核。

### 7.4 孤儿页面

`apps/web/src/pages/BlogPage.tsx`（63 行）没有任何路由或组件引用它。
