## Context

**为什么现在做不到**（动机见 `proposal.md`）：WebBook 的 Android 形态是 TWA，跑在 Chrome 进程内，不持有系统权限；`twa-manifest.json` 的 `enableNotifications: false` 与 `build.gradle` 的 `resValue "bool", "enableNotification", false` 意味着通知委派服务根本没编译进包。三个目标能力所需的 `AlarmManager` + `NotificationManager`、`UsageStatsManager`、`NotificationListenerService` 因此全部不可达。

**现有约束**（决定了下面每一个取舍）：

| 约束 | 现状 | 对本设计的含义 |
|---|---|---|
| 零 VPS、无传统数据库 | 唯一持久层是 `github.ts` 写 GitHub Contents API | 采集数据必须分片，且写入次数要被节流 |
| 逐文件写、每次一个 commit | `github.ts` 用 `enqueueWrite` 串行化 | 逐笔上报会刷爆 git 历史 → 必须批量合并 |
| 前端路由 | `apps/web/src/App.tsx` 用 `BrowserRouter`，部署在 GitHub Pages 子路径 | 宿主必须提供可用的 SPA 回退，故倾向远程加载而非本地打包 |
| 认证 | `supabaseProvider.ts` 仅 `signInWithPassword`，**无 OAuth、无 redirectTo** | 宿主不需要处理深链接回调，登录逻辑零改动 |
| Worker CORS | `Access-Control-Allow-Origin: *` | WebView 内以 `https://heyuan-cyber.github.io` 为源发请求不会被拦 |
| 旧提醒能力 | `reminders.ts` 只有 `{id, noteId, text, createdAt, done}`，无触发时刻；`apps/web` 零引用 | 无 UI 可拆，破坏面小；但模型必须补齐 `dueAt` |
| 并行的 `webbook-node-planner` | 已 scaffold：删除 `RemindersPanel`、三条 `/api/reminders` 路由、`reminders.ts`、`Reminder`/`RemindersIndex` 类型、`extract_todos` 动作与 `mergeTodosFromNote` 副作用；新增 `plan.json` + `/api/plan`；并改写 `README`/`REQUIREMENTS` 的 A-04 | 见下方「与 `webbook-node-planner` 的边界」——这是本设计最容易做错的地方 |

### 与 `webbook-node-planner` 的边界

两个变更都在动"提醒"，但解决的是**不同问题**：

```
webbook-node-planner（另一个 agent）        native-android-companion（本变更）
─────────────────────────────────────      ─────────────────────────────────────
问题：笔记的任务怎么组织                   问题：手机怎么在正确的时间响
─────────────────────────────────────      ─────────────────────────────────────
模型：plan.json，嵌套任务树，              模型：提醒项，扁平，核心是 dueAt
      锚定笔记/栏目，进度与完成率
─────────────────────────────────────      ─────────────────────────────────────
数据：data/users/{u}/plan.json             数据：data/users/{u}/notify.json
      （schedule 为计划日期，非触发时刻）         （dueAt 为精确触发时刻）
      （旧 reminders.json 仅由规划迁移读取）      （与 reminders.json 完全隔离，见 D8）
─────────────────────────────────────      ─────────────────────────────────────
UI ：侧边栏规划弹窗 + 全局任务中心          UI ：提醒编辑 + 手机排程状态
─────────────────────────────────────      ─────────────────────────────────────
```

**设计决定：两者是独立能力，本变更不依赖 `plan.json`，也不往 `plan.json` 写任何字段。** 理由：

1. 语义不同。`plan.json` 的 `schedule` 是"计划哪天做"，一个人可以计划某天做十件事而不希望十次响铃；提醒是"此刻必须打断我"。把两者合成一个字段会逼出"任务=提醒"的错误耦合。
2. 时序不同。`webbook-node-planner` 尚未实现。若本变更依赖它，Phase 1 会被另一个 agent 阻塞，违背"两条线互不阻塞"的初衷。
3. 交集是加法而非改造。将来若要在规划弹窗里"给某个任务加提醒"，那是 `webbook-node-planner` 单向引用本变更的提醒能力，届时新增一个 `sourceTaskId` 之类的外键即可，不需要现在预判结构。

**共同触碰的文件**（实现时必须排在 `webbook-node-planner` 之后，或与该 agent 串行）：

- `workers/api/src/index.ts` — 它删除三条 reminders 路由，本变更新增 `/api/reminders/due` 与提醒 CRUD
- `workers/api/src/aiStrategies.ts` — 它移除 `extract_todos`，本变更挂月度报告策略
- `packages/shared/src/index.ts` — 它移除 `Reminder` 类型，本变更新增提醒/usage/expense 类型
- `packages/shared/src/paths.ts` — 它加 `USER_PLAN_PATH`，本变更加 usage/expenses 路径
- `apps/web/src/components/AppShell.tsx` — 它把顶栏「提醒」改为「任务」；本变更不加顶栏项，入口放在 `/app` 内
- `apps/web/src/lib/api.ts` — 双方都加客户端方法
- `docs/REQUIREMENTS.md` — 它改 A-04，本变更改 §5 非目标并新增条目

## Goals / Non-Goals

**Goals:**

- 在**不改动现有网页前端源码**的前提下，让宿主具备三项系统能力（使用统计读写、通知读取、本地定时通知）
- 保持"零 VPS"：不新增后端服务、不新增数据库、不新增付费或第三方云依赖
- 让"解析/分类/重试"这类**会随外部文案变化的逻辑留在 Web 层**，使规则修正不需要重新出包
- 让采集数据在 GitHub Contents API 的逐文件写入模型下**可长期存续**（分片 + 节流 + 幂等）
- 三条数据线（提醒 / 使用统计 / 消费）的**权限缺失互不牵连**

**Non-Goals:**

- 不重建"笔记 → 待办"提取管道；不定义任务树、进度或完成率（属 `webbook-node-planner`）
- 不做服务端主动推送（FCM / 极光 / 厂商通道）；不做 GMS 依赖
- 不实现完整的 `RRULE` 日历重复语法
- 不覆盖微信/支付宝以外的支付渠道（银行卡短信、云闪付、Apple Pay 等）
- 不做消费预算、超支预警、跨月对账、多币种
- 不做 iOS；不迁移或下线 `apps/android-twa/`
- 不改动 `apps/web` 的任何既有页面与路由（只新增页面）

## Decisions

### D1：宿主采用 Capacitor，网页打包进 APK（`webDir`），**不使用 `server.url`**

`apps/android-cap/` 使用 Capacitor，`webDir` 指向 `../web/dist`（`apps/web` 的 Vite 构建产物）。APK 自带网页，WebView 从 `https://localhost/` 加载本地资产。

> **⚠️ 本节在 apply 阶段被推翻过。** 初版 D1 选的是「远程加载现有站点」（`server.url` → GitHub Pages），理由是网页改动无需重新出包。该决策已废弃，下面是完整经过，保留是为了避免后人重走这条路。

**为什么改**——两条独立的原因叠加：

**① 远程注入分支存在隐蔽失败模式。** 核对 Capacitor 8 源码，远程加载走的是 `WebViewLocalServer.handleProxyRequest`，而注入 bridge 有一个额外前提条件：

```java
// WebViewLocalServer.java:515-554
if (jsInjector != null) {
    if (method.equals("GET")) {
        // 只在 Accept 头含 text/html 时才注入
        if (header.getKey().equalsIgnoreCase("Accept")
            && header.getValue().toLowerCase().contains("text/html")) {
            ...
            responseStream = jsInjector.getInjectedStream(responseStream);
```

一旦该条件不成立（重定向、WebView 行为差异、站点返回非 HTML），页面**照常渲染**，只是 `window.Capacitor` 为 `undefined`——所有原生能力静默失效，界面上看不出任何错误。而本地资产分支（`handleLocalRequest`）按扩展名判定，无条件注入。

**② 远程路径始终未被验证，而验证条件已不具备。** 本项目手机与开发机不在同一网络，局域网探针方案（`WEBBOOK_CAP_MODE=remote-probe`）无法执行；线上探针页需要 push 才能部署。**与其把架构建立在未验证的假设上，不如选已验证的路径。**

**实测通过的证据（本地资产路径）**——探针 v2 在 Redmi Note 13 上的完整回传：

```
typeof window.Capacitor         = object
window.WEBVIEW_SERVER_URL       = https://localhost     ← bridge 注入确实执行
typeof window.androidBridge     = object
Capacitor.getPlatform()         = android
Capacitor.isNativePlatform()    = true
native.pluginReached            = true                  ← 插件调用真的到达原生
```

最后一项是最硬的证据：`pluginReached` 由 `ProbePlugin.java` 写入，只有原生侧真的执行了才可能出现。

**迁移成本经核实几乎为零**（这是改判的关键——初版 D1 高估了打包的代价）：

| 关注点 | 核实结果 |
|---|---|
| 路由 | `App.tsx:82` 的 `basename` 派生自 `import.meta.env.BASE_URL.replace(/\/$/,'')`。打包后 `BASE_URL='/'` → `basename=''` → `undefined`，`BrowserRouter` 在根路径正常工作。**现有代码零改动**，且 `vite.config.ts:6` 的 `base` 默认为 `'/'`（只有 GitHub Pages 构建才用 `VITE_BASE_PATH=/webbook/`） |
| API 连通 | `publicDefaults.ts` 里 API 与 Supabase 都是**绝对 URL**，从 `https://localhost/` 出发照常连通，无需改动 |
| CORS | Worker 为 `Access-Control-Allow-Origin: *`，新源不会被拦 |
| 深链接刷新 | `BrowserRouter` 在本地服务器下刷新深路径会 404，但 APK 内用户接触不到刷新按钮；页面内 `navigate()` 不触发服务器请求。**接受此残留**，不为它引入 hash 路由 |

**代价（明确接受）**：

- 网页改动需要重新构建 APK 才生效，不再有「改网页不用发版」
- 换来：离线可用、启动更快、不依赖 GitHub Pages 可达性、消除静默失效风险

**连带影响**：

- **能力探测**（tasks 5.2）仍不得以 `getPlatform()` 为唯一依据，应以「插件调用是否成功」为准——这条在两种加载方式下都成立
- `apps/android-cap/capacitor.config.ts` **刻意不设置 `server` 字段**，并在文件头写明原因；将来若有人想改回远程加载，必须先真机确认窗口内 `window.Capacitor` 非 undefined
- 若将来确实要用远程加载：可先只对验证过的场景启用，但需接受上面的隐蔽失败模式，并补一个「bridge 缺失」的用户可见提示

**考虑过的替代方案**：

| 方案 | 否决理由 |
|---|---|
| 继续用 TWA | 结构性不可能：无自有进程 → 拿不到任何特殊权限 |
| 远程加载现有站点（初版 D1） | 见上：注入条件脆弱 + 静默失效 + 无法验证。**已否决** |
| 打包进 APK + 前端改 hash 路由 | 经核实 `BrowserRouter` 在打包场景下本就能工作（见上表），改 hash 反而是无谓改动。**不必要的复杂度，否决** |
| 保留 TWA 壳 + 另写独立原生 App | 两个 App 并存、双份安装与心智负担；采集到 UI 的链路被切开 |
| 原生重写（Kotlin + Compose） | 放弃整个 React 前端资产（编辑器、博客、圈子），代价与收益不成比例 |

**代价（明说）**：远程加载意味着 **GitHub Pages 不可达时宿主白屏**；网页更新与原生能力更新不再解耦（改了网页无需出包，改了原生插件必须出包）。这两条接受。

### D2：原生插件只搬运，不做业务判断

三个能力面的契约固定为"原始数据进、原始数据出"：

```
ReminderAlarm.schedule([{id, dueAt, title, body}]) → {scheduled: n}
UsageStats.daily({date})     → {totalMs, apps: [{pkg, label, ms, launches}]}
PayListener.pending()        → [{title, text, pkg, postedAt}]   ← 原始文本
```

**为什么**：微信/支付宝的通知文案会随版本变化。若解析逻辑写在 Kotlin 里，改一条正则就要走一次 APK 出包与侧载；写在 Web 层（TypeScript）则随网页一起更新。**这是本设计里对长期维护成本影响最大的一条。**

**代价**：原始通知文本必须过桥。因此规定它**只在设备内存中流转**——解析后只上报结构字段，原始文本不落盘、不上云（对应 `mobile-expense-tracking` 的"原始通知文本不外传"）。

### D3：不做服务端推送，走"本地调度 + 周期轮询"

```
     云端（唯一事实源）
        ▲  手机主动拉取 /api/reminders/due?window=7d
        │
   WorkManager 每 ~2h 唤醒 ──► 重建 AlarmManager 排程
                                    │
                                    ▼ 到点（离线亦然）
                              NotificationManager
```

**为什么**：服务器没有到手机的连接，也没有设备推送令牌。国内 FCM 在无 GMS 设备上不可用，厂商通道需要逐个接入并要企业资质。而"给自己发提醒"这个场景，本地 `AlarmManager` 的可靠性严格优于任何推送链路——它在飞行模式下也会响。

**考虑过的替代方案**：

| 方案 | 否决理由 |
|---|---|
| FCM | 依赖 GMS；设备大概率无 Google 服务 |
| 极光 / 个推 / 厂商通道 | 引入第三方 SDK 与账号，违背"零第三方云依赖"；为单用户场景过度设计 |
| 前台服务常驻长轮询 | 常驻通知与耗电，Android 对后台限制越来越紧，收益不如本地闹钟 |
| 只在应用打开时检查 | 不满足"定期发送"的核心诉求 |

**排程细节**：只排未来 7 天窗口内的实例（重复提醒展开为具体实例），每次唤醒重建；用 `AlarmManager` 的精确闹钟接口，配合 `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`；`PendingIntent` 用稳定的 request code（由提醒 id 派生）以保证重建时覆盖而非堆叠。

### D4：时区与时间存储

`dueAt` 存 ISO 8601 带偏移或 UTC 的绝对时刻；手机上按设备当前时区解释为本地触发点。跨时区旅行时已排程的实例在下次唤醒时按新时区重算。

**为什么**：提醒是绝对时刻语义（"明早 8 点"指本地 8 点）。若存本地墙上时间字符串，跨时区后会偏移。

### D5：使用统计按天分片 + 采集窗口

```
data/users/{userId}/usage/2026-06-13.json
{ schemaVersion, date, totalMs, apps: [{pkg,label,ms,launches}], truncated: bool }
```

按天分片（而非按年或单文件），使新增一天不需要重写既有分片；采集"上一个已结束的自然日"；应用数超上限时按时长取前 N 并把其余合并为"其他"，保证 `totalMs` 仍准确。

**为什么不用单文件**：GitHub Contents API 是整文件读改写，单文件方案每次追加都要读写全部历史，随天数线性恶化。**为什么不用一天一 commit 之外的办法**：一天一次写入本身已经是自然节流。

**采集方式**：优先 `queryUsageStats` 按日分桶；若国产 ROM 的后台查询受限，退到 `queryEvents` 读前台切换事件自行聚合（精确度更高、成本更大）。**这个选择留待 Phase 0 真机 spike 决定**（见 Open Questions）。

### D6：消费按"分片 + 批量 + 节流"写入

```
手机本地队列（SQLite）
   │ 攒够 N 笔 或 距上次上报超过 T
   ▼
POST /api/tracking/expenses/bulk  [{txn…}]
   ▼ 服务端一次 merge + 一次 putFile
data/users/{userId}/expenses/2026-06.json
```

**为什么**：每笔支付一次 PUT 会产生一次 commit，一个月几百次写入会把 git 历史变成噪声，也会撞上 Contents API 的频率与串行队列上限。批量 + 节流把它压到每天几次量级。

**幂等**：`dedupeKey = sha1(source | minuteBucket(postedAt) | amountCents | merchant)`。服务端按 key 合并，重复上报覆盖同一条而非新增。

### D7：分类先规则、后模型、再回写规则

```
商户 ──► 查 rules.json
          ├─ 命中 ──► 直接用（零模型调用）
          └─ 未命中 ──► 调 AI ──► 成功则把 商户→类别 写回 rules.json
                              └─ 失败 ──► 归入「未分类」
```

**为什么**：模型只对每个**新商户**调用一次，之后是确定性规则命中。这既省钱（现有 Worker 走 DeepSeek 按量计费）又稳定（同一商户不会因模型波动而反复变类），而且用户可以手改规则。类别取自有限枚举，模型输出受枚举约束。

### D8：新提醒模型使用独立文件 `notify.json`，不复用 `reminders.json`，也不复活旧类型

**⚠️ 本节在 apply 阶段的前置验证中被修正过。** 初版决定"写入同一个 `reminders.json`，靠跳过无 `dueAt` 的条目来避免与规划迁移冲突"——该结论**不成立**，因为规划迁移的过滤器并不看 `dueAt`。以下是实测到的真实机制。

**规划迁移的实际语义**（`workers/api/src/plan.ts:70-92` + `packages/shared/src/plan.ts:522-554`）：

1. 触发点：每次 `GET /api/plan`，若 `plan.migratedReminders` 未置位
2. 条件：`if (loaded.plan.migratedReminders) return loaded;` —— 只在该用户**首次加载 `/api/plan`** 时读一次 `reminders.json`
3. 只取 `parsed.reminders` 数组；**不按任何 `dueAt` / `schemaVersion` 字段过滤**
4. 逐条判定：`if (!id || !text) continue;` —— 唯一过滤器是「有 `id` 且有 `text`」
5. 把 `reminder.text` 变成 plan 任务标题，`done` / `createdAt` 一并带入
6. **无论如何都写回 `plan.json`**（注释原话："没有 reminders 也要落盘：否则每次 GET 都会重读一次旧文件"）

**为什么必须换文件**——两个独立的问题：

| # | 问题 | 机制 |
|---|---|---|
| A | **新提醒会被吞成 plan 任务** | 规划迁移只要求 `id` + `text`。只要本变更的提醒模型带有 `text` 字段，首次打开规划时就会被静默转成 plan 任务。且因为第 6 点，这个污染是**一次性的、不可逆的**，之后无法重跑迁移来修正；用户一旦回滚新版规划，这些提醒条目就永久变成任务。 |
| B | **两个变更被隐式耦合进同一份文件** | `migrateRemindersIntoPlan` 读 `reminders.json`，而本变更要写它。规划迁移是否读得到、读到什么，取决于本变更是否已经写过——两个本应独立的变更通过一份文件互相影响。 |

**决定**：

- 新提醒模型使用**新路径** `data/users/{userId}/notify.json`，新增 `USER_NOTIFY_PATH`（路径段 kebab-case，与既有 `USER_*_PATH` 约定一致；文件名取"本地通知条目"之意，与 plan 的"任务规划"、旧 reminders 的"快记"都不撞词）。
- `data/users/{userId}/reminders.json` 与 `USER_REMINDERS_PATH` / `LegacyReminder` **原样留给 `webbook-node-planner`**，本变更不读、不写、不改。
- 新提醒模型**不得包含 `text` 字段**（用 `title` + `body`），从根本上排除被规划迁移误吞的可能。
- `packages/shared` 中由 `webbook-node-planner` 删除的 `Reminder` / `RemindersIndex` 类型**不复活**，本变更定义全新类型。

**代价**：用户在旧 `reminders.json` 里的历史快记不会自动变成新版提醒——它们归规划所有（`webbook-node-planner` 的迁移负责）。本变更的提醒从零开始由用户显式创建。这是可接受的：旧快记本来就没有 `dueAt`，无法成为"到点提醒"。

**部署序**：规划迁移应在本变更上线前跑完（即用户已至少打开过一次规划页）。若未跑完，规划迁移会消费 `reminders.json` 的旧内容、本变更不受影响——两者已无共享文件，因此**不再有互相污染的可能**。

## Risks / Trade-offs

- **[国产 ROM 限制后台 `UsageStatsManager` 查询]** → Phase 0 真机 spike 先验证能否稳定取到 7 天数据；不行则退到 `queryEvents` 自行聚合（设计已预留，`mobile-usage-tracking` 的采集维度不受影响）。**这是本变更唯一可能导致方案返工的点。**
- **[远程加载导致白屏]** → GitHub Pages 不可达时宿主无内容。缓解：保留浏览器与 TWA 两条访问路径；后续可平滑迁移到"打包进 APK + hash 路由"（已列为 Open Question）。
- **[特殊权限的授予率与观感]** → "通知使用权"在系统设置里显示为"此应用可读取所有通知"，观感上很吓人。缓解：应用内先解释用途再跳转；两项权限独立申请，拒绝其一不影响其余功能。
- **[记账解析天生不精确]** → 文案变化、重复推送、多商户格式会导致漏记与错记。缓解：未解析的通知进"待修正"保留痕迹、幂等去重、用户可改分类与删除；**接受"覆盖率不是 100%"**，不做对账承诺。
- **[原始通知文本过桥的隐私面]** → 缓解：只在内存流转，解析后即弃；只上报结构字段；不写入 Web 端持久化存储。
- **[批量合并的读改写竞争]** → 同一账号两台设备同时上报同月分片时，后写覆盖先写。缓解：节流窗口 + 服务端单次 merge 原子写；单用户场景可接受，`webbook-node-planner` 提出的乐观锁方案若落地，本变更的月度分片可复用同一机制。
- **[告警风暴]** → 手机长期关机后恢复，若一次性补发所有过期通知会骚扰用户。缓解：**不补发过期通知**，改为在应用内以"已过期"列表呈现（对应 `mobile-reminders` 的"长时间失效后的处理"）。
- **[与 `webbook-node-planner` 的同文件冲突]** → 双方共同触碰 `index.ts` / `aiStrategies.ts` / `shared/index.ts` / `shared/paths.ts` / `api.ts` / `REQUIREMENTS.md`。缓解：**本变更的实现排在 `webbook-node-planner` 之后**；若需并行则按文件串行分配。
- **[签名与包名迁移]** → 新宿主是新包名与新签名，与既有 TWA 不共享数据，用户需重装并重新登录一次。缓解：接受一次性成本；`apps/android-twa/` 保留以便回退。

## Migration Plan

1. **前置**：`webbook-node-planner` 的改动已全部落地（apply 阶段实测确认），本变更在其之上串行进行。**建议先把它的改动提交**，再叠加本变更，避免同一工作树上两份改动混入同一 commit。
2. **服务端先行且向后兼容**：新增 usage / expense 路径与路由、提醒的读取与 `/api/reminders/due`。新提醒写入**全新的 `notify.json`**（D8），不触碰 `reminders.json`，因此与规划迁移零交集；服务端新增路由不影响既有客户端。
3. **网页端随后**：新增 `/app/usage`、`/app/expense`、提醒编辑入口。这些页面在浏览器中访问时通过能力探测显示"需在手机 App 中使用"。
4. **宿主最后**：构建并侧载 `apps/android-cap`。旧 TWA 保持可用，两条路径并存。
5. **数据迁移**：使用统计与消费从零开始累积（无历史可迁）；新版提醒从零开始由用户创建，**不迁移旧 `reminders.json`**——它的历史快记归 `webbook-node-planner` 的规划迁移。
6. **文档**：更新 `docs/REQUIREMENTS.md`（§5 移除「账单模块」非目标、§4 新增使用统计与记账条目、§4.6 A-04 遵循 `webbook-node-planner` 的改写）与 `docs/DEPLOY-GUIDE.md`（新增宿主构建、特殊权限说明、数据仓新增目录结构）。

**回滚**：卸载 `apps/android-cap` 并继续使用既有 TWA/PWA 即可；服务端新增路由与数据文件不影响既有功能，无需回滚数据。使用统计与消费数据可单独删除对应目录。

## Open Questions

1. **Capacitor 远程加载的确切配置** — `server.url` 与导航白名单的确切键名、插件桥在远程源下的可用性、以及 WebView 内 `Origin` 与 `Access-Control-Allow-Origin: *` 的实际交互，需在 Phase 0 用真机验证。**若插件桥在远程源下不可用，则 D1 的替代方案（打包进 APK + hash 路由）启动**，其余设计不受影响。
2. **是否改用 `setAlarmClock` 而非普通精确闹钟** — 前者更不易被系统省电策略压制，但会在系统状态栏常驻一个闹钟图标。属体验偏好，Phase 1 真机对比后再定。
3. **使用统计是否需要长期聚合视图** — 当前只保留按天分片。若三个月后想看图表的长期趋势，需要额外的月聚合文件；可等到数据真正积累起来再决定。
4. **消费类别枚举的具体取值** — 设计只约束"取自有限集合"，具体分档（餐饮/交通/购物/居住/医疗/娱乐/人情/其他…）可在实现时定，不影响契约。
5. **是否把网页打包进 APK 以换取离线可用** — 与 D1 的代价对应。若实际使用中"Pages 不可达导致白屏"成为困扰，再评估迁移。
