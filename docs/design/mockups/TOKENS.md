# WebBook · 设计 Token 规格 v2

> 配套设计稿：`docs/design/mockups/INDEX.html`
> 用途：确认方向后，把「第 2 节」整块替换进 `apps/web/src/styles/global.css` 的 `:root`，
> 然后按「第 5 节」的映射表把 `layout.css` 里的硬编码逐项换掉。

---

## 1. 为什么要改（现状数字）

| Token 族 | layout.css 现有 `var()` 使用 | 同位置硬编码 |
|---|---|---|
| `--fs-*` | **0** | 188 处 px 字号（11 种尺寸） |
| `--space-*` | **0** | padding 249 行 / margin 203 / gap 187 |
| `--radius*` | 39 | 116 处 px 圆角（7 种 + 999px×15） |
| `--shadow-*` | 23 | 28 处手写阴影（`0 4px 14px rgba(0,0,0,.35)` 重复 7 次） |
| `--accent*` | 139 | 8 处自算透明度（.06/.08/.12/.22/.28/.35） |
| `--z-*` | 6 | 40 处裸 z-index |

**结论**：不是 token 设计得不好，是**没接入**。补全 + 接入即可，不需要换概念。

---

## 2. 共用骨架（三方向一致，放在 `:root`）

```css
:root {
  /* ── 字号阶（8 档，覆盖现有 11 种 px 值）──
     11px=微标签  12px=次级  13px=UI 文本  14px=目录行
     16px=正文    20px=小标题 26px=区块标题 34px=页面标题 */
  --fs-2xs: 11px;
  --fs-xs: 12px;
  --fs-sm: 13px;
  --fs-md: 14px;
  --fs-lg: 16px;
  --fs-xl: 20px;
  --fs-2xl: 26px;
  --fs-3xl: 34px;
  --fs-display: 46px;

  /* ── 间距阶（9 档，现有 6/10/14/18px 全部纳入）── */
  --sp-1: 2px;  --sp-2: 4px;  --sp-3: 6px;  --sp-4: 8px;
  --sp-5: 10px; --sp-6: 12px; --sp-7: 14px; --sp-8: 18px;
  --sp-9: 24px; --sp-10: 32px; --sp-11: 40px;

  /* ── 圆角阶 ── */
  --r-xs: 4px; --r-sm: 6px; --r-md: 8px;
  --r-lg: 12px; --r-xl: 16px; --r-pill: 999px;
  --radius: var(--r-lg);        /* 兼容旧引用 */
  --radius-sm: var(--r-sm);
  --radius-xs: var(--r-xs);
  --radius-lg: var(--r-xl);

  /* ── 阴影阶（新增 --shadow-md 收掉 7 处重复写法）── */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 14px rgba(0, 0, 0, 0.32);
  --shadow-lg: 0 14px 40px rgba(0, 0, 0, 0.42);

  /* ── 层级（现有 40 处裸 z-index 归位）── */
  --z-base: 1; --z-sticky: 20; --z-panel: 40; --z-modal: 60; --z-toast: 100;

  /* ── 动效 ── */
  --dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 260ms;
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* ── 结构（替代现有 9 种容器宽度）── */
  --sidebar-w: 280px;          /* 300 → 280，并支持拖拽写入 localStorage */
  --topbar-h: 56px;
  --measure: 68ch;             /* 长文行宽，替代 42rem / 720px / 980px 三套 */
  --content-max: 1180px;
}
```

### 必须新增的语义 token（替换 33 处 `var(--token, #hex)` 兜底）

```css
:root {
  --stage-bg: var(--canvas);              /* 替代写死的 #0b1220（2 处）*/
  --edge: var(--accent);                  /* 连线，替代写死的 #38bdf8 */
  --edge-preview: var(--text-muted);      /* 替代 #94a3b8 */
  --media-bg: #000;                       /* 视频/3D 底 */
  --handle: #fff;                         /* 图片裁剪与连线端点手柄（4 处 #fff）*/
  --on-media: rgba(255, 255, 255, 0.85);  /* 图上文字（12 处 rgba 白）*/
  --accent-line: rgba(196, 165, 116, 0.42);        /* 描边/分割用强调色 */
  --accent-soft: rgba(196, 165, 116, 0.14);        /* 底色用强调色 */
  --warn-strong: #f59e0b;                 /* 替代 2 处写死值 */
}
```

> ⚠️ **`--muted` 是拼错的 token 名**（真名 `--text-muted`），
> 所以 `layout.css:4032/4099/4216` 的 `var(--muted, #94a3b8)` <b>永远</b>回落到冷灰蓝。
> 改名后这 3 处自动生效，这也是"画布偶尔看起来发蓝"的隐藏原因之一。

---

## 3. 方向一的完整配色（推荐）

```css
:root {
  color-scheme: dark;

  --bg: #14161a;
  --surface-1: #191c21;   /* 侧栏 / 面板（原 --bg-elev 系）*/
  --surface-2: #1f232a;
  --surface-3: #262b33;
  --canvas: #101317;      /* 画布：与外壳同色温，只是更深一档 */
  --canvas-grid: rgba(196, 165, 116, 0.07);

  --text: #eae6df;
  --text-dim: #a29d94;
  --text-muted: #7c776e;

  --accent: #c4a574;
  --accent-strong: #b8945f;
  --accent-bright: #d8bd91;
  --on-accent: #191410;

  --border: #2b3038;
  --border-subtle: #23272e;
  --border-strong: #3a414b;

  --ok: #7eb88a; --warn: #d8a657; --danger: #e0837c; --info: #8aa6c8;
  --scrim: rgba(8, 9, 11, 0.62);
}
```

**与现状的差异**：删掉 `--glass-bg/blur`（顶栏侧栏改实色）、
`--stage-bg` 从 `#0b1220` 改 `#101317`、`--edge` 从 `#38bdf8` 改金色、
新增 `--surface-1/2/3` 命名（原 `--bg-elev/1/2/3` 语义不清）。

### 方向二 / 方向三配色

直接见 `docs/design/mockups/design-system.css` 的 `[data-theme='d2']`、`[data-theme='d3']` 两段，
字段与上面完全一致（同名同角色），可整段替换 `:root` 内容。

---

## 4. 图标集（替换全部 emoji）

24 个 24×24 线性图标，`stroke-width: 1.7`、`stroke: currentColor`、
`fill: none`、圆角线帽。定义在 `docs/design/mockups/*.html` 末尾的 `<svg>` sprite 里，
落地时建议放 `apps/web/src/components/Icon.tsx`（一个 `<Icon name="folder" />` 组件）。

| 语义 | name | 替换掉 |
|---|---|---|
| 笔记本 / 品牌 | `book` | `📓` |
| 目录折叠态 | `folder` / `folder-open` | `📁` |
| 笔记 | `file` | `📄` |
| 新建 | `plus` | `＋` `+` |
| 删除 | `trash` | `🗑` `✕`（删除语义处）|
| 关闭 | `x` | `✕` |
| 重命名 | `pencil` | `✎` |
| 勾选 / 任务 | `check` / `check-square` / `square` | `☑` `☐` `❏` |
| 折叠箭头 | `chevron-up/down/left/right` | `▸` `▾` `«` |
| 搜索 | `search` | 无（新增） |
| 命令面板 | `command` | `☰`（⌘K 入口）|
| 目录树 | `list-tree` | `☰`（目录按钮）|
| 时间 / 历史 | `clock` | 无（新增） |
| 我 / 成员 | `user` / `users` | `👥` |
| 可见性 | `globe` / `lock` / `users` | `🌐` `🔒` `👥` |
| 链接 | `link` | `🔗` |
| 图片 | `image` | `🖼` |
| AI | `sparkles` | `🤖` |
| 拖拽手柄 | `grip` | `⠿` |
| 警告 / 信息 | `alert` / `info` | 无（新增） |
| 后台 | `settings` | `🛠` |
| 刷新 | `refresh` | `⟳` |
| 外部打开 | `external` | `→ 用户端` 文本箭头 |
| 发送 | `send` | 无（新增） |

> 对 `blockFactory.ts:69-77` 的特别说明：那里的 `¶ H 🖼 立方 ♪ 🔗 📌 ―`
> 需要为「段落 / 标题 / 图片 / 3D 模型 / 音频 / 链接 / 便签 / 分割线」各定一个图标
> （本 sprite 已覆盖除音频、3D 外的全部；这两个建议用 `volume` 与 `box`，追加即可）。

---

## 5. 硬编码 → token 映射表（迁移用）

按这个顺序改，每步都能单独跑起来验证。

### 5.1 字号（188 处 → 8 档）

| 现值 | 替换为 | 出现次数 |
|---|---|---|
| `10px` | `var(--fs-2xs)` | 4 |
| `11px` | `var(--fs-2xs)` | 30 |
| `12px` | `var(--fs-xs)` | 58 |
| `13px` | `var(--fs-sm)` | 46 |
| `14px` | `var(--fs-md)` | 27 |
| `15px` | `var(--fs-md)` | 5 |
| `16px` | `var(--fs-lg)` | 5 |
| `18px` | `var(--fs-xl)` | 8 |
| `20px` | `var(--fs-xl)` | 3 |
| `22px` | `var(--fs-2xl)` | 1 |
| `26px` | `var(--fs-2xl)` | 1 |

> 注意 3 处**同一个 H1 四个尺寸**的问题（编辑器 26px / 博客 1.85rem / token 32px / 移动 20px），
> 迁移时统一到 `--fs-3xl`（桌面）、`--fs-2xl`（移动）。

### 5.2 圆角（116 处）

| 现值 | 替换为 | 出现次数 |
|---|---|---|
| `2px` / `3px` / `4px` | `var(--r-xs)` | 28 |
| `6px` | `var(--r-sm)` | 22 |
| `8px` | `var(--r-md)` | 23 |
| `10px` | `var(--r-lg)` | 19 |
| `12px` | `var(--r-lg)` | 7 |
| `999px` | `var(--r-pill)` | 15 |

### 5.3 阴影（28 处）

| 现值 | 替换为 | 出现次数 |
|---|---|---|
| `0 4px 14px rgba(0,0,0,.35)` | `var(--shadow-md)` | **7** |
| `0 8px 24px rgba(0,0,0,.35)` | `var(--shadow-lg)` | 2 |
| `0 12px 40px rgba(0,0,0,.35)` | `var(--shadow-lg)` | 1 |
| `0 16px 40px rgba(0,0,0,.35)` | `var(--shadow-lg)` | 1 |
| `0 2px 8px rgba(0,0,0,.18)` | `var(--shadow-sm)` | 1 |
| 其余带第二层 glow 的 | `var(--shadow-glow)` | 4 |

### 5.4 颜色（必改，安全性相关）

| 位置 | 现值 | 替换为 |
|---|---|---|
| `layout.css:1397, 3425` | `#0b1220` | `var(--stage-bg)` |
| `layout.css:3737` | `stroke: #38bdf8` | `var(--edge)` |
| `layout.css:3743` | `stroke: #fbbf24` | `var(--accent-bright)` |
| `layout.css:3747` | `stroke: #94a3b8` | `var(--edge-preview)` |
| `layout.css:572` | 气泡文字 `#04222f`（冷青） | `var(--on-accent)` |
| `layout.css:1107` | `#fbbf24` | `var(--warn)` |
| `layout.css:3639, 4072` | `#f87171` | `var(--danger)` |
| `layout.css:1328,1337,3560,3757` | `#fff`（手柄/端点） | `var(--handle)` |
| `layout.css:977,4201,4240` | `#e2e8f0` | `var(--text)` |
| `layout.css:1511` | `#1e293b` | `var(--text)` |
| `layout.css:4230` | `#111` | `var(--media-bg)` |
| `layout.css:4241` | `#333` | `var(--border)` |
| 33 处 `var(--x, #hex)` | — | 删掉兜底值 |
| `var(--muted, …)` ×3 | — | `var(--text-muted)` |

### 5.5 死代码（可直接删）

| 行 | 内容 | 说明 |
|---|---|---|
| `1707-1713` / `1715-1721` | `.settings-group input` | **逐字节重复**的两块 |
| `1166-1169` | `.btn-sm` | 被 `3075-3078` 完全覆盖 |
| `2448-2453` / `2455-2459` | `.io-card` / `:hover` | 被 `4581-4600` 覆盖 |
| `3434-3436` | `.stage-viewport.is-panning` | 与 `3456-3458` 相同 |
| `2310-2313` | `@keyframes io-bob` | 与 `4408-4411` 重名，前面无效 |
| `1995-2133` | 首页 v4（139 行） | 无后继引用 |
| `2134-2208` | 首页 v5 霓虹（75 行） | 无后继引用 |
| `2209-2471` | `io-*` 单页首页（263 行） | Swiss 只覆盖 `io-site-*`，不覆盖 `io-hero-*` |
| `2473-2517` | blog-home-v2 头部（45 行） | 被 `io-blog-*` / `swiss-blog-*` 取代 |
| `1393-1517` | `.canvas-*`（126 行） | 被 `.stage-*` 取代 |

**合计约 700-900 行（12-16%）**，删除前建议先用 grep 在 `apps/web/src` 里确认类名无引用。

---

## 6. 接入顺序（每步可独立验收）

1. **只换 `:root`**：把第 2 节整块替换进去，**保持所有旧 token 名做别名**（`--radius: var(--r-lg)` 等），
   此时界面应当<b>零变化</b> —— 这是安全基线。
2. **删 33 处兜底 + 修 `--muted`**：验证画布/图谱/AI 条颜色是否仍正确（这一步会把冷蓝暴露出来）。
3. **换颜色**（第 5.4 节）：画布变暖、连线变金。
4. **字号与圆角迁移**（5.1 / 5.2）：建议按 section 分批，每批截图对比。
5. **阴影与 z-index 归位**（5.3）。
6. **删死代码**（5.5）：先 grep 确认，再按段删除，每删一段跑 `npm run build`。
7. **图标替换**：按文件分批（TreeSidebar → PlanTaskTree → BlockEditor → 其余）。
