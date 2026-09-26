# WebBook · 页面皮肤（三套主题色切换）

> 代码：`apps/web/src/styles/theme.css`（颜色定义）、`src/lib/theme.ts`（运行时）、
> `src/components/ThemeSwitcher.tsx`（切换 UI）
> 截图对照：`docs/design/mockups/_after/skins/`

---

## 1. 用法

| 入口 | 形态 |
|---|---|
| 笔记本顶栏右上角 | 紧凑下拉（默认） |
| 博客广场导航栏 | 紧凑下拉 |
| 管理后台顶栏 | 紧凑下拉 |
| 个人主页 → 站点设置 → 「页面皮肤」 | 三选一面板 |

- 切换**即时生效**，无需刷新。
- 选择保存在本机 `localStorage['webbook:theme']`，不隨账号同步到其他设备。
- 移动端地址栏 / PWA 状态栏底色（`<meta name="theme-color">`）跟着皮肤变。

---

## 2. 三套皮肤

| key | 名称 | 气质 | 底色 | 强调色 | `color-scheme` |
|---|---|---|---|---|---|
| `gold` | 墨金（默认） | 暖石墨 + 金，长时间写作最安静 | `#14161a` | `#c4a574` | dark |
| `paper` | 纸墨 | 纸白 + 墨 + 朱砂，白天读写对比度最好 | `#f4f1ea` | `#a8442a` | light |
| `blueprint` | 蓝图 | 冷石墨 + 青，工程图纸感 | `#0e1114` | `#35d0ba` | dark |

每套皮肤包含三类差异，而不只是换强调色：

1. **表面色阶**（`--bg` / `--bg-elev` … `--bg-elev-3`）——纸墨是反相的亮色阶。
2. **材质**——玻璃面板的底色/模糊/高光不同（纸墨用近不透明纸面 + `blur(8px)`，
   避免浅色上模糊发灰）；蓝图侧栏加网格底纹；纸墨整页加极淡纸纹。
3. **场景色**——`--canvas`（画布底）、`--edge`（连线）、`--handle`（手柄）、
   `--on-media`（图上文字）。纸墨的画布是米色网格 + 朱砂连线。

**尺度 token（字号 / 间距 / 圆角 / 阴影）不参与换肤** —— 换皮肤不应该改变排版与密度。

---

## 3. 实现约定（后续加皮肤看这里）

### 3.1 颜色只有一个来源

```
styles/global.css   →  尺度层（字号 / 间距 / 圆角 / 阴影 / 层级 / 动效）+ 字体
styles/layout.css   →  组件样式，只消费 token，不写字面色值
styles/theme.css    →  【颜色的唯一来源】[data-theme=...] 下的全部语义 token
```

`main.tsx` 的引入顺序必须是 `global.css` → `layout.css` → `theme.css`，**theme.css 放最后**。
`layout.css` 里曾经有一份 `.swiss-home { --s-* }` 的重复定义（纯黑 + 蓝），
因为它后加载会覆盖 theme.css，导致个人主页不随皮肤切换 —— 已删除，
`--s-*` 现在由 theme.css 映射到全局语义 token。

> 当前 `layout.css` 里已 **没有** 任何 hex / rgba 字面色值（除 `mask-image` 里的
> `#000`，那是遮罩 alpha 不是颜色）。加新样式时请沿用这条约束，否则新皮肤会漏色。

### 3.2 新增一套皮肤

1. 在 `styles/theme.css` 加一段 `[data-theme='<key>'] { ... }`，**照抄 `gold` 的变量清单**
   （表面 5 档 + 文字 3 档 + 强调 6 个 + 描边 4 个 + 状态 6 组 + 遮罩/玻璃 7 个 + 场景 6 个）。
2. 在 `lib/storage.ts` 的 `THEME_SKINS` 里加 key。
3. 在 `lib/theme.ts` 的 `THEME_META`（UI 标签 + 色板缩略图）和 `THEME_COLOR`（浏览器 UI 底色）里加一条。
4. 在 `index.html` 的首屏防闪脚本里放行新 key（白名单校验 + `colors` 映射）。
5. 若需要专属质感，在 theme.css 末尾加 `[data-theme='<key>'] .某选择器 { ... }`。

### 3.3 首屏防闪

`index.html` 里有一段**同步内联脚本**，在样式表生效前就读 `localStorage` 并写到
`<html data-theme>`。否则会先渲染默认的墨金皮肤再跳到用户选的皮肤。
改皮肤 key 时**必须同步改这段脚本的白名单**，否则会被重置为 `gold`。

---

## 4. 验收记录

`_after/skins/` 下每套皮肤各有 3 张（笔记本 / 博客广场 / 登录页），
另有 `switcher-open.png`（下拉菜单）、`blueprint-mobile.png`。

实测（Playwright，1600×1000）：

| 皮肤 | `data-theme` | `color-scheme` | `--bg` | `--accent` | `--canvas` | `--edge` | `<body>` 实际底色 |
|---|---|---|---|---|---|---|---|
| 墨金 | gold | dark | `#14161a` | `#c4a574` | `#101317` | `#c4a574` | `rgb(20,22,26)` |
| 纸墨 | paper | light | `#f4f1ea` | `#a8442a` | `#f7f4ec` | `#a8442a` | `rgb(244,241,234)` |
| 蓝图 | blueprint | dark | `#0e1114` | `#35d0ba` | `#0b0f13` | `#35d0ba` | `rgb(14,17,20)` |

交互验证：菜单三项正确 → 点击「蓝图」后 `data-theme` 与 `localStorage` 同步更新 →
刷新后保持 `blueprint`。`tsc` 与 `npm run build` 均通过。
