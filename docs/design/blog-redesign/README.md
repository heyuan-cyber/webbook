# WebBook 博客 · 美化设计稿说明

> 设计稿（可直接双击打开）：**[BLOG-DESIGN.html](BLOG-DESIGN.html)**
> 现状实拍：`before/`（线上站 headless 实拍 5 张）
> 相关前置：方向一「墨金」视觉层已落地，三套皮肤可切换（见 [../SKINS.md](../SKINS.md)）

---

## 1. 现状取证（为什么看起来"空"）

### 1.1 容器宽度错配 —— 主因

| 元素 | 实测值 | 问题 |
|---|---|---|
| `.blog-header-inner` | `max-width: 920px` | 页头内容实际只占 ~560px，1600px 屏上右侧 ~700px 全空 |
| `.blog-main` | `max-width: 920px` | 同上 |
| `.blog-list` | 864px 宽的两列 grid | 卡片被拉宽，内部留白更多 |

`.blog-shell` 高度 `100vh` 起，所以空出来的区域直接是一大片背景色 —— 这是"博客看着空"的根因，
不是配色问题。实拍见 `before/01-hub-square.png`。

### 1.2 卡片信息量不足

后端返回的 `PublicFeedItem` **本来就有**这些字段：

```ts
ownerId, ownerEmail, noteId, title,
updatedAt?, summary?, visibility?, category?, cover?
```

但界面只渲染了 title / 作者 / 日期 / 「阅读 →」。
`summary`（摘要）、`category`（分类）、`cover`（封面）全部没用上 —— 所以卡片又高又空。

### 1.3 没有信息层级

广场上所有卡片尺寸、字重、内边距完全一致，没有"头条"概念。读者第一眼不知道该看哪篇。

### 1.4 卡片高度不齐

`.blog-list` 是普通 grid，行高由该行最高卡片决定，而卡片没有 `min-height` 也没有把页脚推到底部
（无 `margin-top:auto` 结构），所以短标题的卡片页脚浮在中间。

### 1.5 移动端横向溢出

「博主」区用 `flex-wrap`，390px 下 chip 总宽超过视口，第二张被切掉一半
（实拍 `before/02-hub-mobile.png`）。整页 `scrollWidth` 虽然被压住了，但内容确实被裁。

### 1.6 文章页问题

- 文章头（分类/标题/作者）与正文连在一起，没有独立的标题区。
- 正文行宽与页面容器同为 920px 体系，长文行宽偏宽。
- **桌面端没有目录**：`.blog-toc` 只在 `≤720px` 出现折叠开关，宽屏反而没有。
- 文章读完直接结束，没有作者卡、没有相关文章、评论区独立成块但缺少上下文。

### 1.7 个人主页近乎空白

实拍 `before/03-user-blog.png`：整页纯黑，中间一个 800×320 的空态卡片。hero 没有用满容器宽度。

---

## 2. 设计目标

| # | 目标 | 手段 |
|---|---|---|
| 1 | 页面"不再空" | 容器 920 → **1200px**，页头改整宽 masthead，正文另用 720px 阅读行宽 |
| 2 | 有主次 | **头条大卡 + 等高网格 + 更新流** 三层 |
| 3 | 卡片有信息量 | 用起 `summary` / `category` / `cover` / `updatedAt`，补阅读时长与字数 |
| 4 | 长文好读 | 18px / 行高 1.85 / 72ch；章节分割线；代码块语言标签；图片 `figcaption` |
| 5 | 阅读有导航 | 右栏常驻 sticky 目录 + 顶部进度条 |
| 6 | 读完有下文 | 作者卡 + 继续阅读 + 评论 |
| 7 | 移动端不破版 | 博主条横滑 + mask 渐隐；单列卡片；目录折成 `<details>` |
| 8 | 换肤不出错 | 全部颜色走语义 token，三套皮肤（墨金/纸墨/蓝图）自动继承 |

---

## 3. 关键设计决策

### 3.1 为什么是「编辑式」而不是「卡片瀑布 / 大图墙」

WebBook 的博客本质是**技术文档的公开面**。而且你的数据里**多数文章没有封面图**（`cover` 可选）。
瀑布流会让无图文章变成一堆空洞。所以：

- 头条用**排版**撑场（kicker + 大标题 + 完整摘要 + 元信息 + 右栏统计/封面），无封面时右栏退化为统计面板；
- 网格卡片用**摘要**撑场（两行 `-webkit-line-clamp:2`）；
- 封面只在**有图时**才占位（`aspect-ratio:16/9`）。

### 3.2 三层信息架构

```
masthead       品牌区（kicker/标题/lede） + 操作区 + tab 条 + 检索/分类 chips
─────────────────────────────────────────────────────────────
博主            横滑 chip 条（mask 渐隐）
本期头条        1 张整宽两栏大卡（1.9fr : 288px）
最新文章        auto-fill minmax(320px,1fr) 等高网格 + 页脚贴底
更新流          条目列表（等宽日期列 + 标题 + 一行摘要 + 作者）
─────────────────────────────────────────────────────────────
```

「更新流」是新增的，用于"我就要找那篇"的扫读场景。**它让页面变长，如果你想更短可以砍掉**
（见第 5 节待拍板事项）。

### 3.3 正文规格

| 项 | 值 |
|---|---|
| 字号 / 行高 | 18px / 1.85 |
| 行宽 | 720px（≈72ch） |
| 段落间距 | 18px |
| H2 | 26px + **上方 1px 分割线**（章节切分） |
| H3 | 20px |
| 引用 | 左 2px 强调色边 + 衬线 + 1.05em |
| 代码 | 行内强调色 `--accent`；块 `--bg-elev-1` + 1px 边 + 右上语言标签 |
| 列表 | marker 用强调色 |
| 图片 | 包 `figure` + `figcaption`（居中、`--fs-xs`） |

### 3.4 效果清单（都做了降级）

| 效果 | 实现 | 降级 |
|---|---|---|
| 卡片 hover | 边框转 `--accent-line` + 背景提亮一级 + `translateY(-2px)` | 纸墨皮肤下位移减为 -1px（`--hover-raise`） |
| 封面 zoom | `scale(1.04)` | 仅 `@media (hover:hover)`；`prefers-reduced-motion` 下关闭 |
| 滚动揭示 | 沿用现有 `Reveal` | stagger 限制在首屏 4 个元素内；降级为静态 |
| 阅读进度 | 顶部 2px 条 + 目录底部百分比 | 只过渡 `width`，不触发布局 |
| 目录高亮 | 当前章节 `--accent` + 左边线 | 纯颜色变化 |

所有动效只动 `border-color / background / transform / opacity`，不触发布局重排。

---

## 4. 落地顺序（每步可独立验收）

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **P0** | 容器 920→1200；masthead 三段式重排；卡片 `min-height` + `margin-top:auto` 页脚贴底 | 纯 CSS，收益最大 |
| **P1** | 卡片补摘要 / 分类 chip / 阅读时长（用已有 `PublicFeedItem` 字段） | 无需改后端 |
| **P2** | 头条模块（取最新一篇） | 纯前端；手动置顶需 `SiteConfig` 加字段 |
| **P3** | 文章页重排：标题区 / 正文规格 / 右侧目录 / 文末三段 | 与 `BlogArticleView` 编译产物一致（组件被编辑器预览复用，改动会同步到「预览」） |
| **P4** | 个人主页 hero + 作品横滑 + 条目列表 | 涉及 `swiss-*` 那套皮肤 |
| **P5** | 更新流 + 检索/分类筛选（前端过滤） | 数据量小时够用；量大再加接口 |

> ⚠️ **P3 注意**：`BlogArticleView` 同时被 `/blog` 文章页和**编辑器的「预览」模式**使用
> （`NoteEditor.tsx` 的 `editor-blog-preview`）。所以改它的排版会同时改变编辑器预览的观感 ——
> 这是符合预期的（预览就该等于线上），但验收时要两处都看。

---

## 5. 需要你拍板的三件事

1. **「更新流」要不要保留？** 扫读效率最高，但页面会变长（首屏之后约 5 行/篇）。
   若嫌重复，可只保留「头条 + 网格」。
2. **头条固定取"最新一篇"，还是支持手动置顶？** 后者需要在 `SiteConfig` 加一个字段。
3. **要显示阅读时长 / 字数吗？** 需要按字数估算（约 400 字/分钟）。
   feed 接口若无正文，可先用 `summary` 字数近似（会不准，但便宜）。

---

## 6. 已落地的修复（本轮直接改了代码，均已验证）

> 用户要求"先给设计稿"，但排查过程中发现几处**真实缺陷**（含 2 个跨皮肤 bug），
> 已顺手修掉；**视觉重设计（容器宽度、masthead、头条模块）仍等确认后再动。**

| # | 问题 | 修法 | 文件 |
|---|---|---|---|
| 1 | **纸墨皮肤下代码块不可读**：`color-mix(--media-bg 85%)` 底 + `--text` 字，paper 下两者都是 `#1b1a17` | 新增 `--code-bg` 每皮肤专属代码底色 | `theme.css` + `layout.css:1100` |
| 2 | **纸墨皮肤下个人主页顶栏黑底黑字**：写死 `rgba(0,0,0,.72)` | 改 `color-mix(--bg 82%)`，跟随皮肤 | `layout.css` |
| 3 | **卡片永远不等高**：grid 直接子元素是 `Reveal` 包裹层 / `<li>`，不是 `.blog-card`，所以 `margin-top:auto` 从未生效（swiss 网格早有同款修法，博客网格漏了） | 补 `.blog-list > .reveal, .blog-list > li { display:flex }` + 卡片 `width:100%` | `layout.css` |
| 4 | **卡片封面是坏装饰**：8px 横条落在卡片 20/22px 内边距内，顶部圆角永远看不到，读起来像多一条横线；而真实 `cover` 字段没用 | 改为真封面（`margin:-20px -22px 10px` + `img{object-fit:cover}`），**无图不占位** | `layout.css` |
| 5 | **超长标题被静默裁掉**：`.blog-card{overflow:hidden}` 无断行保护，没有省略号 | 标题加 `overflow-wrap:anywhere` + `line-clamp:2` | `layout.css` |
| 6 | **目录在手机上排到评论区之后**：`.blog-article-layout` 单列化后 TOC 仍是第二个 grid 子元素，折叠按钮落在整页最底部 | `BlogPostPage` 中把 `ArticleToc` 从 grid 子元素移出，改由 CSS 定位（编辑态/移动端可正确折叠） | `BlogPostPage.tsx` + `layout.css` |
| 7 | **锚点跳转后标题贴顶**：只有 `.io-site-section` 有 `scroll-margin-top` | 给 `.blog-a-h` 补 `scroll-margin-top` + `:first-child{margin-top:0}` | `layout.css` |
| 8 | **回到顶部按钮被 toast 盖住**：`.back-to-top` 与 `.toast-host` 锚点完全相同（都是 `bottom:20px;right:20px`），发评论的 toast 正好压住它 | 抬到 `calc(72px + safe-area-inset-bottom)` | `layout.css` |
| 9 | **正文标题倒挂**：`.blog-a-h3` = 19.2px **小于**正文 20px；三级同字重，层级只靠字号 | 收到 `--fs-3xl/2xl/xl` 并区分字重 700/650/600 | `layout.css` |
| 10 | **假段落 3 倍节奏差**：段内换行 7px vs 段落间距 22px | 段内换行收到 0.7em | `layout.css` |
| 11 | **`var(--s-text)` 作用域越界**：`.comment-avatar` 引用了只在 `.swiss-home` 下定义的 token → 声明失效、文字色退化为继承色 | 改用 `--media-bg` | `layout.css` |
| 12 | **`layout.css` 里 43 处 rgba 字面色**（含旧 teal 强调 `rgba(79,216,196,·)`、旧蓝 `rgba(56,189,248,·)`） | 新增 `--scrim-1..4` / `--blackout-1..4` / `--accent-faint` / `--accent-soft-2/3` / `--accent-mid`，由 `--media-bg`、`--accent` 按皮肤色相派生 | `theme.css` + `layout.css` |

**验证结果**

| 检查 | 结果 |
|---|---|
| `tsc --noEmit` | 通过 |
| `npm run build` | 通过 |
| `layout.css` 颜色字面量 | **hex 0 处、rgba 0 处**（仅剩 `mask-image` 里的 `#000`，那是遮罩 alpha 不是颜色） |
| 三皮肤 × 三页面低对比度扫描 | 无真实问题（探针报的 2 处均为误报：渐变按钮底、`currentColor` 图标） |
| 截图 | `_qa/verify-{gold,paper,blueprint}-blog.png` |

> 还有一批审计发现**未修**（需单独排期，会改变产品行为而非视觉）：
> 圈子 feed 失败被显示成"还没有加入圈子"（`BlogHubPage.tsx:231` 硬编码 `error={null}`）；
> `BlogPage.tsx` 63 行死代码未接路由；圆子文章路由缺 TOC/评论/元信息；
> feed 无分页、圈子 N+1 请求；`.blog-tabs` 的 `role=tablist` 没有 `aria-selected` / 方向键。

---

## 7. 文件索引

| 文件 | 内容 |
|---|---|
| `BLOG-DESIGN.html` | **设计稿**（含三皮肤切换按钮，右上角可切墨金/纸墨/蓝图） |
| `before/01-hub-square.png` | 现状 · 博客广场 1600px |
| `before/02-hub-mobile.png` | 现状 · 广场 390px（可见博主条被裁） |
| `before/03-user-blog.png` | 现状 · 个人主页（近乎空白） |
| `before/04-article.png` | 现状 · 文章页 |
| `before/05-article-mobile.png` | 现状 · 文章页 390px |
| `_qa/hero-crop.png` | 设计稿自查 · 页头 + 头条 |
| `_qa/article.png` | 设计稿自查 · 文章页（标题区/正文/目录） |
| `_qa/site.png` | 设计稿自查 · 个人主页 hero + 作品 + 博客 |
| `_qa/mobile-1.png` / `mobile-2.png` | 设计稿自查 · 手机画板（390×818 实尺寸） |
| `_qa/skin-gold.png` / `skin-paper.png` / `skin-blueprint.png` | 同一版设计在三套皮肤下的渲染 |

### 设计稿实测尺寸（自查通过）

| 元素 | 值 |
|---|---|
| masthead / body 容器 | 与视口同宽（上限 1200px） |
| 头条两栏 | 主栏 748px + 右栏 288px |
| 最新文章网格 | 3 列（`auto-fill minmax(320px,1fr)`） |
| 文章页容器 | 1200px = 正文 720px + 目录 232px + 间距 |
| 手机画板 | 390×818（真机尺寸） |

