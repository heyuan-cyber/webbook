# WebBook 设计稿 · 六阶段「个人主页交互层」

> **入口：双击 `docs/design/round6/INDEX.html`**
>
> **先纠正上一轮的偏差**：你举「右下角放个宠物」是**举例**，要的是「支持更多交互效果」。
> 我把它当成了目标，只做了宠物。这一轮补上真正的答案：
> **一套可分类、可组合、可批量降级的交互层**，宠物只是里面 `character` 这一类的一个实例。
>
> 探索模式产物，**没有改任何产品代码**。

---

## 1. 现状：六层里四层是空的

```
层 1 · 排版动效   内容"到位"     部分 ✓  Reveal / marquee
层 2 · 反馈动效   操作"被确认"   部分 ✓  卡片 hover
层 3 · 空间动效   页面有"深度"   空 ✗   ← 视差 / 倾斜 / 光晕 / 涟漪
层 4 · 内容动效   数据"可读"     空 ✗   ← 更新热力 / 数字到位 / 进度
层 5 · 角色动效   页面有"住户"   空 ✗   ← 宠物 / 彩蛋 / 领路（五阶段已设计）
层 6 · 时间动效   页面有"当下感" 空 ✗   ← 深夜 / 节日 / 第 N 次来访
```

### 代码事实（不是猜的）

| 事实 | 含义 |
|---|---|
| **`hooks/` 只有 1 个文件**（`useMediaQuery.ts`） | 没有任何交互 hook —— 交互能力现在散在各组件里手写 |
| **reduced-motion 有两套机制** | `useMotionSafe()`（9 个文件）+ `Reveal.tsx` 里直接 `matchMedia` 一次。**两套写法迟早会漏** |
| **动效 token 只有时长和缓动** | `lib/motion.ts` 3 档时长 / 2 条缓动，**没有位移距离、没有错峰步长** —— 而这两个最容易写歪 |
| **没有「关闭交互」的出口** | 访客除了改系统设置，没有任何办法让页面安静下来 |

---

## 2. 交互层 = 触发器 × 效果 × 约束

新增一条交互 = **组合一个触发器和一效果**，而不是写一个新组件。

### 触发器（10 个）— 访客做什么

| | 现状 | 个人主页上的用法 |
|---|---|---|
| `hover` | ✅ 已有 | 卡片抬起、词标乱码归位、脉络格悬停出日期 |
| `near` | 🆕 | 磁吸按钮、光标光晕、宠物转头 |
| `scroll:enter` | ✅ Reveal | 区块入场、数字到位、连线绘制 |
| `scroll:progress` | ✅ 文章页 | 阅读进度线、视差、顶栏 morph |
| `scroll:idle` | 🆕 | 宠物打哈欠、「要不要我带你逛逛？」 |
| `click` | ✅ 已有 | 涟漪、揭示隐藏段落、宠物说话 |
| `clock` | 🆕 | 深夜换文案、节日换词标、周年 |
| `visit:nth` | 🆕 | 第二次来宠物先看你 |
| `key` | 🆕 | 输入 `he` 触发签名动画 |
| `hash` | 🆕 | 揭示「只发给某个人」的段落 |

### 效果（13 个）— 页面怎么回应

`rise` · `stagger` · `parallax` · `tilt` · `magnetic` · `spotlight` · `scramble` · `draw` · `pop` · `morph`(功能) · `character` · `heatmap`(功能) · `reveal`(功能)

**每条都带参数上限**，写进类型而不是注释：

```
tilt        ≤ 6°        超过 10° 文字开始变形
magnetic    ≤ 8px       且点击热区永远不动
parallax    速率差 ≤ 2×  超过会让人觉得"页面散了"
stagger     封顶第 8 项  否则第 20 项要等近 1 秒
rise        位移 ≤ 12px、时长 ≤ 300ms
pop         不做 0→N 计数动画，只做到位
morph       不改高度     否则下方内容会跳
```

### 约束（7 条）— 每条交互都必须满足

① 可分类 `kind: functional | decorative`　② 访客可一键关闭　③ 关闭时**根本不注册监听**
④ 不用常驻 rAF　⑤ 移动端不挂载 hover 类交互　⑥ 不挡内容、热区不动　⑦ 首屏不阻塞

**① 是所有降级策略的前提** —— 分不清功能/装饰，就只能一刀切全关，那会连阅读进度一起砍掉。

---

## 3. 实验室：把约束做成可验证的东西

`lab.html` 里右上角有一个 **「装饰型交互：开启/关闭」** 开关。打开关掉，你会看到：

- ②③④⑤ 光晕 / 倾斜 / 磁吸 / 乱码 → **全灰掉，提示"装饰型交互已关闭"**
- ⑦⑨⑩⑪⑫ 脉搏 / 进度 / 顶栏 morph / 隐藏段落 / 深夜文案 → **照常工作**

这就是这份设计稿最想说的一件事：**交互必须能被分类，才能被批量降级。**

---

## 4. 组合：新增一条交互只是填一个对象

```ts
interface Interaction {
  id: string;
  target: string;      // 语义槽位：'hero' | 'card' | 'wordmark' | 'corner' …
  on: TriggerKind;     // 触发器
  do: EffectKind;      // 效果
  kind: 'functional' | 'decorative';
  params?: Record<string, number | string>;
  minWidth?: number;   // 低于此宽度不挂载
}

const HOMEPAGE: Interaction[] = [
  { id: 'hero-parallax', target: 'hero',   on: 'scroll-progress', do: 'parallax', kind: 'decorative', params: { layers: 3, maxRate: 1.8 } },
  { id: 'card-tilt',     target: 'card',   on: 'hover',           do: 'tilt',     kind: 'decorative', params: { max: 6 }, minWidth: 721 },
  { id: 'pet',           target: 'corner', on: 'near',            do: 'character',kind: 'decorative', params: { species: 'fox', radius: 260 }, minWidth: 1100 },
  { id: 'read-progress', target: 'article',on: 'scroll-progress', do: 'morph',    kind: 'functional' },
];
```

### 站主视角：预设包，不是 20 个参数

| 预设 | 内容 |
|---|---|
| **安静 quiet**（默认） | `rise · stagger · morph · heatmap · reveal` |
| **有反应 lively** | quiet + `parallax · tilt · spotlight · scramble` |
| **玩心 playful** | lively + `character · magnetic · clock · hash` |

```ts
SiteConfig.interactions = {
  preset: 'lively',
  disable: ['card-tilt'],
  params: { 'pet.species': 'owl', 'hero-parallax.maxRate': 1.4 },
}
```

---

## 5. 落地形态：4 个文件，不是 20 个组件

| 新增 | 职责 |
|---|---|
| `lib/interactions/catalog.ts` | 触发器/效果枚举 + **参数上限写进类型** |
| `lib/interactions/presets.ts` | 三个预设包 = 三份 `Interaction[]` |
| `hooks/useInteractions.ts` | 读配置 → 解析预设 → **统一判断 reduced-motion / 访客关闭 / 断点** 再挂载。把现在散在各处的 `useMotionSafe()` 收敛到这里 |
| `components/FxToggle.tsx` | 页脚「让页面安静下来」开关，写 `localStorage` |
| `layout.css` 追加 | 补 `--stagger-*` / `--move-*` token |

**注意这 4 个文件没有一个在加新功能** —— 它们只是把已有交互收进一个可查询、可批量开关、可配置的层。
之后再加「点击涟漪」「节日词标」「栏目占比环」都只是往 catalog 里加一条。

---

## 6. 文件

| 文件 | 内容 |
|---|---|
| **`INDEX.html`** | 框架：六层现状盘点、触发器/效果/约束三张清单、组合机制、落地形态、三件待拍板 |
| **`lab.html`** | **13 条可点交互** + 装饰型总开关 + 减少动态开关 |
| `r6.css` / `r6.js` | 共用样式与驱动。**关闭时根本不注册监听**，不是"注册了但不执行" |
| `../round5/pet-lab.html` | 宠物（= `character` 效果的一个实例），行为预算已在那边细设 |

---

## 7. 待拍板

| # | 问题 | 选项 | 我的建议 |
|---|---|---|---|
| **Q1** | 交互层的边界 | **A** 建交互层（catalog + presets + useInteractions）　**B** 只补几条高价值交互　**C** 只做约束与降级 | **A**。这是唯一能回答「支持**更多**交互」的方案；B 半年后又是一堆手写 |
| **Q2** | 默认预设 | **安静** / 有反应 / 玩心 | **安静**。个人主页第一任务是让人读文章，想要花哨的站主自己去开 |
| **Q3** | 访客的「安静开关」放哪 | **A** 页脚一行文字链　**B** 右下角小图标　**C** 不给手动开关 | **A**。不占视觉、能被找到、不打扰。现在代码里完全没有这个出口 |

---

## 8. 明确不动

- **配色与 token 值**：墨金体系不动，本轮只往 token 里**补** `--move-*` / `--stagger-*`
- **五阶段的宠物设计**：整条保留，它在六层框架里归入「角色动效」
- **Swiss 版式**：满屏 hero、marquee、scroll-spy 全保留
- **数据与 API**：只加 <code>SiteConfig.interactions</code> 一个可选字段，缺省 = 安静预设，零 Worker 改动
