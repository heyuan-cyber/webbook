## Why

WebBook 的 Android 形态是一个 TWA（`apps/android-twa`，`io.github.heyuan_cyber.twa`）。TWA 本质是 **Chrome 的一个标签页**——它跑在 Chrome 的进程里，应用自身不持有任何系统权限。当前工程的三处印证：

- `twa-manifest.json` → `"enableNotifications": false`
- `app/build.gradle` → `resValue "bool", "enableNotification", false`（`DelegationService` 未编译进包）
- 三个 Java 文件（`Application` / `LauncherActivity` / `DelegationService`）全是 bubblewrap 模板，**零业务代码**

这直接挡住了三类个人需求：**到点提醒、每天手机用了多久/各 App 分别多久、支付时自动记账**。它们分别要 `AlarmManager` + `NotificationManager`、`UsageStatsManager`（`PACKAGE_USAGE_STATS` 特殊权限）、`NotificationListenerService`（通知使用权）——**这三样在 Web 沙箱里没有任何入口**，PWA 的 `Notification` / `PeriodicBackgroundSync` 无法替代（后台时机不可控，且拿不到系统数据）。

现有后端也不能直接承接：`workers/api/src/reminders.ts` 已经是"孤儿能力"——它只有 `{id, noteId, text, createdAt, done}`，**没有"什么时候提醒"这个字段**；`apps/web/src` 里对 reminder 零引用（无 UI）；它的唯一消费者是 `aiStrategies.ts` 的夜间 `extract_todos`，把笔记内容提取成待办。也就是说：**提醒能力有存储、有 API、有数据，就是不能提醒**。

同时，另一个 agent 正在重构笔记侧的任务管理系统并删除旧提醒功能。本变更据此划清边界：**做"手机端调度 + 通知投递 + 采集"，不碰"笔记 → 待办提取管道"**，自带一个最小提醒模型，使两条线互不阻塞。

## What Changes

用 Capacitor 给现有 React SPA 套一个**真正属于自己的 Android 进程**，通过 Kotlin 插件把系统能力搬进 Web 层；采集到的数据经现有 Worker 写入同一个 GitHub 私有仓。**不新增后端、不新增数据库、不改变"零 VPS"约束。**

- **新增 `apps/android-cap/`（Capacitor 工程）** — `server.url` 直连现有 GitHub Pages SPA，**前端页面一行不改**。现有 `BrowserRouter` 与 Supabase 会话因此在 WebView（`https://` 安全源）中原样可用。现有 `apps/android-twa/` 保留作回退，不删除。
- **三个 Kotlin 插件（薄搬运层，不含业务逻辑）**：
  - `UsageStats` — 返回"昨天"各 App 前台毫秒数
  - `PayListener` — 返回原始通知 `{title, text, packageName, postedAt}`，**不在原生侧解析金额**
  - `ReminderAlarm` — 接收 `[{id, dueAt, title, body}]` 并排好本地闹钟
  - 由 `WorkManager` 周期唤醒（每 2 小时量级）完成：拉取提醒 → 重排闹钟 → 补报离线积压数据
- **提醒改走"本地调度 + 轮询"** — 云端只存提醒、手机来取。服务器无法主动连手机（`服务器 ──✗──▶ 手机`），因此手机每 N 小时拉 `/api/reminders/due`，本地 `AlarmManager` 排好所有未来时刻；到点由系统闹钟弹通知，**离线可用、零成本、不依赖 GMS**。提醒模型补上 `dueAt` / `repeat` 字段。
- **使用统计自动采集** — 按天写入 `data/users/{userId}/usage/YYYY-MM-DD.json`，Web 端新增图表页展示每日总时长与各 App 耗时排行。
- **消费自动记账** — 监听微信/支付宝通知 → **Web 层（TypeScript）**用正则解析金额/商户 → 分类（`rules.json` 规则优先，未命中才调 AI 并回写规则）→ 按天聚合、按小时节流合并写入 `data/users/{userId}/expenses/YYYY-MM.json`。Web 端新增账单页：月度明细、分类占比、改分类、删误记。
- **提醒使用全新数据文件 `notify.json`，不与旧提醒共享任何文件** — 新增路由 `GET /api/reminders/due` 与提醒 CRUD（`title` / `body` / `dueAt` / `repeat`）。**本变更不读、不写、不迁移 `data/users/{userId}/reminders.json`**：该文件及其 `USER_REMINDERS_PATH` / `LegacyReminder` 原样归 `webbook-node-planner` 的规划迁移所有。理由见 `design.md` 的 D8——该迁移的过滤器是「有 `id` 且有 `text`」且会把结果永久写进 `plan.json`，共用文件会让本变更的新提醒被静默吞成规划任务。
  - 旧 `workers/api/src/reminders.ts`、三条 `/api/reminders` 路由、`RemindersPanel` 已由 `webbook-node-planner` 删除（apply 阶段实测确认），因此本变更**不再产生 BREAKING**：它只是在空位上新增能力。
- **PRD 范围变更** — `docs/REQUIREMENTS.md` §5 目前把「账单模块」列为**非目标**；本变更将其正式移出非目标并落为实现。

**非目标（本变更明确不做）：**

- **不重建"笔记 → 待办"自动提取管道** — 旧 `extract_todos` / `mergeTodosFromNote` 的替代方案属于另一个 agent 的任务系统重构，本变更不定义、不实现、不依赖。删除旧代码后，本变更的提醒模型可独立工作（自带最简提醒的创建/编辑 UI）。
- 不做服务端主动推送（FCM / 极光 / 厂商通道）—— 已论证不需要。
- 不做逐笔手动记账录入页 —— 只做自动记录 + 修正（改分类、删误记）。
- 不做独立原生 App（Kotlin + Compose 重写）—— 复用现有 React 资产。
- 不做 iOS。
- 不做消费预算/超支预警、不做跨月对账。

## Capabilities

### New Capabilities

- `mobile-companion-shell`：手机端外壳与原生桥——Capacitor 工程如何承载现有 SPA、WorkManager 周期唤醒、三个原生桥的返回契约、特殊权限的引导与降级行为、离线积压补报。
- `mobile-reminders`：到点提醒——提醒项的建模（含 `dueAt`/`repeat`）、云端为唯一事实源、手机拉取与本地排程、通知投递、去重与已投递标记、离线与权限缺失时的行为。
- `mobile-usage-tracking`：手机使用统计采集——按天采集哪些维度、采集窗口与聚合口径、存储分片、图表页展示、权限未授予时的降级。
- `mobile-expense-tracking`：消费自动记账——通知识别范围、金额/商户解析规则、幂等去重、分类规则引擎与 AI 回退、月度分片合并与写入节流、账单页展示与修正操作。

### Modified Capabilities

无。现有 `openspec/specs/**` 全部是 `web-ui-*`（视觉与前端体验）能力；本变更不改变它们的任何需求，且此前后端/数据行为（提醒、账单）从未进入 spec 层。本变更新增的 Web 端页面（使用统计、账单、提醒编辑）以 `mobile-*` 能力描述，不回写 `web-ui-*`。

## Impact

- **新增工作区**：`apps/android-cap/`（Capacitor 工程 + 4 个 Kotlin 插件）、方案文档（真机 spike 清单与结论）。
- **`packages/shared/src/`**：新增 `usage.ts`、`expense.ts`、`notify.ts`；`paths.ts` 加 `USER_NOTIFY_PATH`、`usage`、`expenses`、`expense-rules` 路径。**不修改** `USER_REMINDERS_PATH`，不复活 `Reminder` / `RemindersIndex`。
- **`workers/api/src/`**：新增 `tracking.ts`（usage + expenses 读写与合并）、`notify.ts`（新版提醒读写）；新增路由 `/api/reminders/due`、`/api/tracking/usage/sync`、`/api/tracking/expenses/bulk`；`aiStrategies.ts` 挂月度报告；`index.ts` 接线路由。
- **`apps/web/src/`**：新增 `/app/usage`（使用统计）、`/app/expense`（账单）两个页面 + 提醒编辑 UI；`lib/api.ts` 加对应客户端方法。**不改动既有页面与路由**（另一 agent 正在改 `AppShell.tsx` 顶栏，本变更避开该文件）。
- **`docs/REQUIREMENTS.md`**：§5 非目标移除「账单模块」；§4 新增使用统计与记账条目。
- **数据仓**：新增 `data/users/{userId}/notify.json`（新版提醒）、`data/users/{userId}/usage/`、`data/users/{userId}/expenses/`、`data/users/{userId}/expenses/rules.json`；**不修改**既有的 `reminders.json`（归 `webbook-node-planner`）。
- **云服务**：仍只需 GitHub + Cloudflare Worker + Supabase；**不新增任何付费或第三方云服务**。
- **与 `webbook-node-planner` 的时序（apply 阶段已验证）**：该变更已**全部落地**——`workers/api/src/reminders.ts`、`RemindersPanel.tsx`、三条 `/api/reminders` 路由、`extract_todos`、`Reminder`/`RemindersIndex` 类型均已删除，`mergeTodosFromNote` 调用已移除。因此本变更的合并顺序为：**先提交它，再叠加本变更**。唯一残留的共享面是 `index.ts`、`aiStrategies.ts`、`packages/shared/src/index.ts`、`paths.ts`、`apps/web/src/lib/api.ts`、`docs/REQUIREMENTS.md` 这几个纯追加位置，无删除冲突。
- **已知风险（实现前需用真机 spike 消除）**：部分国产 ROM 限制后台 `UsageStatsManager` 查询，可能拿不到 7 天数据。spike 结论决定 Phase 2 走 `queryUsageStats` 还是退到 `queryEvents` 自行聚合。
