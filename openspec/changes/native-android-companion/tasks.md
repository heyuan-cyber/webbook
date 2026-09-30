## 1. 前置：与 webbook-node-planner 对齐

- [x] 1.1 确认 `openspec/changes/webbook-node-planner` 的实现已完成或已明确让路，重点确认这些改造已落地：删除 `workers/api/src/reminders.ts`、删除三条 `/api/reminders` 路由、移除 `aiStrategies.ts` 的 `extract_todos` 动作与 `mergeTodosFromNote` 调用、从 `packages/shared` 移除 `Reminder` / `RemindersIndex` 类型
  - 结论：**已全部落地**（工作树实测，非推测）。`workers/api/src/reminders.ts` 与 `apps/web/src/components/RemindersPanel.tsx` 均已删除；`aiStrategies.ts` 的 `runCronStrategies` 已无 `extract_todos` 分派（第 40-54 行注释明确记录其下线）；`mergeTodosFromNote` 调用已移除；三条 `/api/reminders` 路由已删除；`Reminder` / `RemindersIndex` 已被 `LegacyReminder`（仅迁移用）取代。新增 `workers/api/src/plan.ts`、`packages/shared/src/plan.ts`、`apps/web/src/store/usePlanStore.ts`、`apps/web/src/components/plan/`。注意：改动仍在工作树中未提交（`git status` 显示大量 M/D/??），本变更的实现与其叠加在同一工作树上。
- [x] 1.2 若该变更尚未完成，与负责它的 agent 约定共同触碰文件的串行顺序（`workers/api/src/index.ts`、`workers/api/src/aiStrategies.ts`、`packages/shared/src/index.ts`、`packages/shared/src/paths.ts`、`apps/web/src/lib/api.ts`、`docs/REQUIREMENTS.md`）
  - 结论：**前置门禁已满足，无需并行协商**——该变更的代码改动已全部落地在磁盘上，本变更在其之后串行进行即可。唯一残留的串行依赖是提交顺序（建议先把 `webbook-node-planner` 提交，再叠加本变更，以免同一工作树上两份改动混在一个 commit 里）。
  - **但发现一处 design 缺陷，见 1.4**
- [x] 1.3 记录基线：当前 `npm run typecheck` 与 `npm run lint` 的结果，作为后续比对基准
  - 基线（在 `webbook-node-planner` 已落地的状态下测得）：

    | 命令 | 结果 | 备注 |
    |---|---|---|
    | `npm run typecheck -w apps/web` | ✅ 通过（exit 0） | |
    | `npm run typecheck -w packages/shared` | ✅ 通过（exit 0） | |
    | `npm run typecheck -w workers/api` | ✅ 通过（exit 0） | |
    | `npm run lint` | ❌ **失败：766 errors / 1 warning，分布 89 个文件** | **全部是 `no-undef`，与本次改动无关，见 1.5** |

  - 三处 typecheck 全绿，说明 `webbook-node-planner` 的重构是自洽的，本变更可以在一个干净的编译基线上开始。
  - **基线在 apply 期间漂移过一次**：第一次记录时（16:38）仓库仍被另一个 agent 改写，`apps/web` 曾出现 `LoginPage.tsx(41,31): error TS2554: Expected 3 arguments, but got 2`（`saveTree` 签名加 `baseRev` 导致的调用点未跟上）。对方收尾后该错误自行消失。**最终生效的基线以 18:45 的复测为准（三处 typecheck 全绿、lint 14 errors）**。
  - 教训：本任务的"记录基线"不能只做一次快照——若仓库仍在变动，快照会失效。1.1/1.2 的门禁必须配合"写入活动归零"的实测才算真正通过。
- [x] 1.4 **修正 design 缺陷——新提醒模型不得复用 `reminders.json`**
  - 结论：**已修正**。`design.md` 的 D8 已重写，`proposal.md` 的 BREAKING 段与 Impact 段已同步。
  - 实测到的机制（推翻了初版结论）：规划迁移 `mergeReminders` 的过滤器是 `if (!id || !text) continue;`（`packages/shared/src/plan.ts:541`），**完全不看 `dueAt`**；且它在无条目时也会把 `migratedReminders` 标记写回 `plan.json`（`workers/api/src/plan.ts:89-91`），因此污染是**一次性且不可逆**的。
  - 修正后：新版提醒使用**新文件** `data/users/{userId}/notify.json` + 新增 `USER_NOTIFY_PATH`；`reminders.json` / `USER_REMINDERS_PATH` / `LegacyReminder` 原样留给 `webbook-node-planner`；新提醒模型**不含 `text` 字段**（用 `title` + `body`），从根上排除被误吞。
  - 附带更正：原文的「旧快记归规划、新提醒靠跳过无 `dueAt` 条目共存」是错的想法——换文件后两者已无共享面，不存在共存问题。
- [x] 1.5 **确认 `npm run lint` 基线的处理方式**
  - 结论：**已修好 ESLint 配置，`lint` 现在可以当门禁用**。
  - `eslint.config.js` 按三个运行时（browser / worker / node）分组声明 globals；新增 `globals@14`、`eslint-plugin-react-hooks@5.2.0` 为显式 devDependency；对 TS 文件按 typescript-eslint 官方建议关闭 `no-undef`（`tsc --noEmit` 已覆盖未定义标识符——这一步是数量骤降的主因，不是靠逐条补 globals）。
  - **803 errors / 89 files → 14 errors / 1 file**：

    | 阶段 | errors | 说明 |
    |---|---|---|
    | 修复前 | 803 | 800 条 `no-undef` 环境误报 + 3 条杂项 |
    | 配置重写后 | 20 | 余 `react-hooks` 规则未安装导致的 "Definition not found" |
    | 装 `eslint-plugin-react-hooks` 后 | 39 | 新暴露 14 条真实 `rules-of-hooks` + 暴露 9 个文件解析态（当时正值另一 agent 改写中途，属撕裂读） |
    | 补 `docs/**/*.js` 与 `probe-*.mjs` globals、清理杂项 | **14** | 全部集中在 `BlockEditor.tsx` 的 `rules-of-hooks` |

  - 顺手清理的真实问题：`scripts/assert-plan-store.mjs` 与 `scripts/deploy-user-pages.mjs` 各一个未使用导入；`packages/shared/src/blocksToMarkdown.ts` 两处 `[\[\]]` → `[[\]]`；`packages/shared/src/feishuZip.ts` 控制字符正则加定向 disable（剔除控制字符是刻意行为）；`apps/web/src/pages/site/HomeTab.tsx` 一条失效的 disable 指令。
  - **遗留 14 条 `rules-of-hooks` 是真实 React bug，不是误报**：`BlockEditor.tsx:781` 在 `blocks.length === 0 && !readOnly` 时提前 `return`，其后的 14 个 Hook（`commitImageSrc` 等，从第 800 行起）在有内容时才会执行 → 违反 Hooks 调用顺序。空→非空切换时会触发 "Rendered more hooks than during the previous render"。**属存量缺陷、超出本变更范围，已单列报告，未修。**
  - 遗留 9 条 `react-hooks/exhaustive-deps` 为 warning，是既有的依赖数组提示，不影响 exit code。

## 2. Phase 0 真机 spike（硬门禁，未通过不得继续）

> **进度**：2.1 已完成并产出可安装 APK；2.2–2.10 需要真机操作，由项目所有者执行。
> 本轮采用「探针优先」顺序——先回答门禁问题（桥是否可用），再谈生产可用性。
> 待验证的包：`apps/android-cap/dist/webbook-host-probe-debug.apk`（本地源对照基线）
> 生产包用 `node scripts/android-cap-apk.mjs` 生成（远程加载）。

- [x] 2.1 在 `apps/android-cap/` 生成 Capacitor 工程骨架（`@capacitor/core` + `@capacitor/cli` + `@capacitor/android`），`appId` / `appName` 另取，不占用既有 TWA 的 `io.github.heyuan_cyber.twa`
  - 结论：**已完成**。Capacitor 8.5.2；`appId = io.github.heyuan_cyber.webbook`（与 TWA 的 `io.github.heyuan_cyber.twa` 不同，可并存安装互不覆盖）；`namespace` / `applicationId` 一致；生成的 `capacitor.config.json` 确认带上 `server` 字段。
  - 环境实测：Java 17.0.2、Android SDK `android-36`、build-tools 36.1.0、Node 24.19.0 —— Capacitor 8 要求 `compileSdk 36` / `minSdk 24`，本机满足，无需额外安装。
  - 构建链路打通：`assembleDebug` **BUILD SUCCESSFUL**，APK 约 4.1 MB。
  - 新增可复用脚本 `scripts/android-cap-apk.mjs`（支持 `--probe` / `--release`），与既有 TWA 的 `android:apk` 完全分开。
  - 两个踩坑记录：① Capacitor CLI **只识别 `capacitor.config.ts`**（`--config` 不存在），因此 probe / production 分流必须写在同一份配置里，用 `WEBBOOK_CAP_MODE` 环境变量切换；② `@capacitor/core` 的本地安装需显式装上 `typescript`，否则 CLI 无法解析 `.ts` 配置直接 fatal。
- [x] 2.2 ~~配置远程加载~~ **已作废（D1 改判）** —— 不再配置 `server.url`，改为把 `apps/web` 构建产物打包进 APK
  - 作废原因见 `design.md` D1 的完整记录：远程注入分支存在隐蔽失败模式（`handleProxyRequest` 仅在 `Accept` 含 `text/html` 时注入，不满足则页面照常渲染但 `window.Capacitor` 为 undefined），且该路径始终无法验证（手机与开发机不在同一网络）。
  - 替代验证改为：打包版 APK 能打开站点、能在 `/app`、`/blog`、`/admin` 之间路由跳转。**待真机验证。**
- [x] 2.3 **验证插件桥可用** —— 本地资产路径**已通过**；远程源路径**已作废**
  - 代码：`ProbePlugin.java`（在 `MainActivity.onCreate` 中于 `super` 之前注册）+ `apps/android-cap/scripts/build-probe.mjs` 生成的探针页；已确认 `ProbePlugin` 编入 `classes6.dex`。
  - **本地资产路径实测通过**（Redmi Note 13，探针 v2 回传）：`typeof window.Capacitor = object`、`window.WEBVIEW_SERVER_URL = https://localhost`、`typeof window.androidBridge = object`、`Capacitor.getPlatform() = android`、`Capacitor.isNativePlatform() = true`、`native.pluginReached = true`（最后一项由原生侧写入，是插件调用真的到达原生的硬证据）。
  - 判定口径写进探针页本身：`bridgeOk` 以 `Probe.ping()` **真的返回原生事实**为准，`platformOk` 以 `getPlatform() === 'android'` 为准，两者分开报告。
  - 过程记录：v1 探针首行即 `const { Capacitor } = window.Capacitor;`，无 try/catch，导致桥缺失时整页脚本不执行、连「我挂了」都显示不出来（页面永远停在静态文案「检测中…」）。v2 改为「先写 DOM、全程 try/catch、带超时轮询等待 `window.Capacitor`」，并在 Node 里用最小 DOM 桩对三种场景（无桥 / 桥正常 / platform=web）各跑一遍验证判定逻辑。**教训：诊断工具自身不能假设被测对象存在。**
  - 远程源那一半不再验证：已改走打包路径，该分支不再被使用。
- [x] 2.4 验证登录态：在宿主内用邮箱密码登录，完全关闭应用后重启，确认仍为已登录
  - **站点加载 ✓ / 登录 ✓ 已真机确认**（打包版 APK，`webbook-host-bundle.apk`）。
  - 登录成功这一点同时证明了两条链路：① 打包后的网页在 `https://localhost` 源下能正常启动 React 应用；② Supabase 认证从该新源可达（此前 TWA/PWA 用的是 `heyuan-cyber.github.io` 源）。
  - **子项「完全关闭应用后重启仍为登录态」尚未单独确认**，留作首次日常使用时的观察项——这是"能不能当日常 App 用"的关键，不能默认成立。
  - 说明：验证过程中曾因装错包（同包名、同图标、字节数几乎相同的三个 APK 混放）看到 `ERR_CONNECTION_TIMED_OUT`，那是**远程探针包**在访问已废弃的局域网地址，不是本包的问题。已删除全部废弃探针 APK，现在 `apps/android-cap` 下只剩一个 APK，物理上无法再选错。
- [x] 2.5 验证网络调用：在 WebView 内确认对 Worker API 的跨域请求正常（CORS 与 `Origin` 的实际交互）
  - **✓ 已确认**。判定依据：登录成功后应用能正常进入笔记本界面，说明登录态的后续请求（读目录树 `GET /api/tree`、读笔记）在 `https://localhost` 源下成功通过——若 CORS 被拦，登录后会停在错误态而不会进入正常界面。
  - 本项是**首次以 `https://localhost` 为源调用 Worker**。Worker 的 `Access-Control-Allow-Origin: *` 按预期生效，无需改动。
  - 残留观察项：写操作（保存笔记）未单独确认，与 2.4 的重启项一并留作日常使用观察。
- [ ] 2.6 **验证 `UsageStatsManager`**：授予使用情况访问权限后，查询最近 7 天并逐日取各应用前台时长，记录能否取到、数据是否合理、是否有 ROM 截断；判定走 `queryUsageStats` 还是退到 `queryEvents` 自行聚合
- [ ] 2.7 **验证 `NotificationListenerService`**：授予通知使用权后，实际发生一笔微信支付与一笔支付宝支付，记录收到的原始通知标题与正文原文，确认能拿到、文案形态是什么
- [ ] 2.8 **验证精确闹钟**：在息屏与省电模式下确认到点能弹出通知；对比普通精确闹钟与 `setAlarmClock` 的可靠性差异
- [ ] 2.9 把 2.1–2.8 的结论写成结论记录（放在 `apps/android-cap/` 或 `docs/` 下的 spike 说明），明确标注：插件桥是否可用、UsageStats 走哪条路、通知文案样例、闹钟接口选择
  - 2.1 / 2.2 / 2.3 的结论已记录在 `docs/spike-android-host.md`；2.4–2.8 待真机结果回填。
- [x] 2.10 ~~若 2.3 判定远程源不可用则改走打包路径~~ **已执行（提前触发）**
  - D1 改判后立即落地：`capacitor.config.ts` 的 `webDir` 指向 `../web/dist` 且**刻意不设 `server` 字段**；`scripts/android-cap-apk.mjs` 默认即为 bundle 模式（自动构建 `apps/web`，可用 `--skip-web-build` 复用已有 dist）。
  - 经核实**前端无需改 hash 路由**（初版 D1 的这一判断是错的）：`App.tsx` 的 `basename` 派生自 `BASE_URL`，打包后为空 → `BrowserRouter` 在根路径正常工作；`vite.config.ts` 的 `base` 默认为 `'/'`，只有 Pages 构建才注入 `VITE_BASE_PATH`。
  - 打包版 APK 已产出并核验：`assets/public/` 含 22 个 web 产物 chunk + `index.html`，`capacitor.config.json` 内**无 `server` 字段**。
- [x] 2.11 把诊断探针页移出随包发布的网页产物：`apps/web/public/__cap-probe/` 会被 Vite 原样复制进 `dist`，因而进入 APK（已核验存在于 `assets/public/__cap-probe/index.html`）
  - 探针页是诊断工具，不应随产品发布，也不该在 Pages 上对公众可见
  - 方案：从 `apps/web/public/` 移除，仅保留 `apps/android-cap/www/` 一份（probe 模式使用）；生成器 `build-probe.mjs` 的 `--out` 参数保留，以便将来确有远程诊断需求时再产出

## 3. 共享数据模型（packages/shared）

- [x] 3.1 `paths.ts` 新增 `USER_NOTIFY_PATH`（新版提醒，指向 `data/users/{userId}/notify.json`）与 usage / expenses / expense-rules 的数据仓路径函数，命名与既有 `USER_*_PATH` 约定一致；**不改动 `USER_REMINDERS_PATH`**
  - 落地：新增 `USER_NOTIFY_PATH` / `USER_USAGE_DAY_PATH` / `USER_EXPENSES_MONTH_PATH` / `USER_EXPENSE_RULES_PATH`；`USER_REMINDERS_PATH` 一字未动。
- [x] 3.2 新增使用统计数据模型：单日分片结构（`date`、`totalMs`、`apps[]` 含 `pkg`/`label`/`ms`/`launches`、`truncated`），带 `schemaVersion`
  - 落地：`packages/shared/src/usage.ts`。含 `normalizeUsageDay` / `capUsageApps` / `usageShare` 与上限常量。
  - **关键不变式**：`normalizeUsageDay` **重算** `totalMs` 而不是采信传入值——`totalMs` 必须等于 `apps` 之和，否则界面占比会算错。已断言覆盖（传入 99999 被纠正为实际之和）。
  - `capUsageApps` 合并"其他"时保持总时长不变；`truncated` 仅在真的截断时置位。
- [x] 3.3 新增消费数据模型：单条记录（`id`、`amountCents`、`merchant`、`postedAt`、`source`、`category`、`dedupeKey`）、月度分片结构、分类规则结构，均带 `schemaVersion`
  - 落地：`packages/shared/src/expense.ts`。含 `normalizeExpense` / `mergeExpenses` / `normalizeExpenseMonth` / `normalizeExpenseRules` / `summarizeExpenses`。
  - 金额为**分单位的整数**（避免浮点误差累加到月度合计）。
  - 幂等键 `computeDedupeKey` 把 `postedAt` **按分钟归桶**：同一笔支付的重复通知（措辞不同、相差几秒）收敛为一条，而"金额商户相同但时刻明显不同"的两笔仍保留为两条。用 djb2 而非 crypto，使该函数在 Worker 与前端都无运行时依赖。
  - `mergeExpenses` 是"重复上报不产生两条"的唯一实现点；**人工修正过的类别（`categoryPinned`）不被后续自动分类覆盖**。
  - `summarizeExpenses` 保证各类别之和恒等于总额（spec 明确要求）。
- [x] 3.4 新增提醒模型：`id`、`title`、`body`、`dueAt`、`repeat`（`none` | `daily` | `weekly` | `weekdays`）、`done`、`source`、`notifiedAt`、`createdAt`，带 `schemaVersion`，含读取时的归一化函数
  - 落地：`packages/shared/src/notify.ts`。含 `normalizeNotifyItem` / `normalizeNotifyIndex` / `isDeliverable` / `isMissed` / `expandNotifyInstances`。
  - **⚠️ 本任务原文与 spec 冲突，已按 spec 修正**：原文写"丢弃无 `dueAt` 的条目"，但 `mobile-reminders` 的「缺少触发时刻的提醒」场景要求这种条目**保留**为"仅记录、不定时"的形态。二者冲突时以 spec 为准（spec 是行为契约）。实际实现为：`dueAt` 可选，无 `dueAt` 的条目保留但由 `isDeliverable` 排除在送达之外；**只丢弃连 `id` 或标题都没有的坏数据**。已加断言锁定该行为。
  - `repeat` 为有限枚举，`NOTIFY_REPEATS` 是唯一取值来源（spec 要求"不存在其他可选的重复方式"）。
  - `expandNotifyInstances` 展开 `[from, to)` 窗口内的具体实例：`daily` / `weekly` / `weekdays` 语义已断言；`weekdays` 按**本地**日历判定（提醒是本地绝对时刻语义，用 UTC 会让跨时区用户的工作日错位）；有 `maxInstances` 上限防止长时间跨度失控循环；窗口边界为 from 闭、to 开。
- [x] 3.4b 新增断言：确认新提醒模型不含 `text` 字段，且 `USER_NOTIFY_PATH` 与 `USER_REMINDERS_PATH` 指向不同文件
  - 落地：`scripts/assert-companion-models.mjs`，**55 项断言全部通过**。除 3.4b 要求的两条外，还把使用统计归一化、消费幂等键与合并、月度汇总不变式一并锁进断言——这些都是"错了会静默出错"的类型。
  - 运行方式：`npm run build --workspace packages/shared && node scripts/assert-companion-models.mjs`
- [x] 3.5 定义消费类别的有限枚举常量
  - 落地：`EXPENSE_CATEGORIES`（food / transport / shopping / housing / medical / entertainment / social / education / other / uncategorized）+ `EXPENSE_CATEGORY_LABELS` + `isExpenseCategory` 守卫。
  - **answer 了 design 的 Open Question 4**（类别枚举具体取值）。
  - 模型推断的输出受此枚举约束，是把 AI 自由文本收敛成可统计维度的关键；非法值在归一化时被丢弃。
- [x] 3.6 定义三个原生桥的 TypeScript 契约类型（排程入参/返回、单日用量返回、原始通知返回），与 `design.md` 的 D2 一致
  - 落地：`packages/shared/src/nativeBridge.ts`。含 `NativeCapabilities` / `ReminderAlarmBridge` / `UsageStatsBridge` / `PayListenerBridge` / `RawNotification` / `PAY_SOURCE_PACKAGES`。
  - `ReminderAlarmBridge.schedule` 的语义是**提交即重建**（原生按传入的一组重建全部排程），因此调用方必须提交完整窗口内容而非增量——这个语义在类型注释里写明，避免误用。
  - `RawNotification` 被显式标注为"唯一允许承载原始通知文本的结构，只在设备内存中流转"。
  - 记录了一条探测纪律：**能力探测不得以 `Capacitor.getPlatform()` 为唯一依据**，必须落到"插件调用是否真的返回"。Phase 0 的探针 v1 正是栽在这个假设上。
- [x] 3.7 在 `packages/shared/src/index.ts` 导出以上新增模块，确认不复活已被移除的 `Reminder` / `RemindersIndex` 命名
  - 已导出 `usage` / `expense` / `notify` / `nativeBridge`；grep 确认未复活旧命名。
- [x] 3.8 构建 `packages/shared` 通过（`npm run build --workspace packages/shared`）
  - `tsc -p tsconfig.json` exit code 0。

## 4. 服务端（workers/api）

- [x] 4.1 新增 `workers/api/src/tracking.ts`：使用统计的读取、按「用户 + 日期」幂等写入
  - 落地 `loadUsageDay` / `saveUsageDays` / `loadUsageRange` / `listUsageDates` / `deleteUsageRange`。
  - **幂等**来自「用户 + 日期」路径本身（同日期覆盖同一文件）；`saveUsageDays` 丢弃日期非法或零应用的条目，因此**不会产生"零值日期记录"**——否则界面会把"没采集"误当成"当天没用手机"（spec 明确禁止）。
  - `enumerateDates` 有 400 天上限，避免超大区间。
- [x] 4.2 在 `tracking.ts` 中实现消费月度分片的读取、按 `dedupeKey` 合并的批量写入、分类规则的读取与写入
  - 落地 `loadExpenseMonth` / `saveExpensesBulk` / `loadExpenseRules` / `saveExpenseRules` / `updateExpenseCategory` / `deleteExpense` / `loadExpenseOverview` / `lookupExpenseRule`。
  - `saveExpensesBulk` **按月份分组后每月份只落一次盘**——这是"一次 merge + 一次持久化"的落点，也是避免逐笔 commit 的地方。返回 `{added, merged, rejected, months}` 便于客户端与测试观察。
  - `updateExpenseCategory` 同时把「商户 → 类别」写入规则，实现 spec 的「修正沉淀为规则」。
  - `deleteExpense` 在月份清空时**删除空分片**，不留空壳文件。
- [x] 4.3 新增路由 `POST /api/tracking/usage/sync`（批量上报多天，幂等覆盖同日期）
  - 附带上限保护：单次提交的日期数超过 `USAGE_BACKFILL_MAX_DAYS * 4` 直接 400，避免被当作批量写入通道。
- [x] 4.4 新增路由 `GET /api/tracking/usage`（按日期或区间读取，仅本人）
  - 支持 `?date=` 取单日，或 `?from=&to=` 取区间。另加 `GET /api/tracking/usage/dates` 列出已有日期（供界面做日期选择器，避免逐日探测）。另加 `DELETE /api/tracking/usage?from=&to=` 支持 spec 的「用户主动清理」。
- [x] 4.5 新增路由 `POST /api/tracking/expenses/bulk`（批量提交，一次 merge + 一次持久化）
  - 单次上限 200 条：既防滥用，也保证单次请求不会拖垮 Worker。
- [x] 4.6 新增路由 `GET /api/tracking/expenses`（按月或区间读取明细与规则，仅本人）
  - 一次返回 `{month, summary, expenses, rules}`，供账单页一次取全，避免多轮往返。默认当月。
- [x] 4.7 新增路由 `PATCH /api/tracking/expenses/:id`（改类别，并把该商户→类别写入规则）
  - 类别经 `isExpenseCategory` 校验，非法值 400——**这是"类别取值有界"在服务端的执行点**。
- [x] 4.8 新增路由 `DELETE /api/tracking/expenses/:id`（删误记）
- [x] 4.9 新增提醒 CRUD 路由（列表、创建、修改、标记完成、删除），读写 `notify.json`，全部要求登录且仅限本人
  - 落地 `workers/api/src/notify.ts` + `/api/notify` 系列路由。**全部读写 `notify.json`，不触碰 `reminders.json`**（design D8）。
  - `patchNotifyItem` 只接受白名单字段，避免调用方覆盖 `id` / `createdAt`；`dueAt` / `notifiedAt` 用显式 `null` 表示清除（降级为"仅记录、不定时"，spec 允许该形态）。
  - **送达回写走独立端点** `/api/notify/:id/delivered`，不在通用 PATCH 里暴露 `notifiedAt`——否则客户端可以伪造成"已送达"，那"已排程 vs 已送达"的区分就失去意义。
  - 文件命名 `notify.ts` 而非 `reminders.ts`：后者是刚下线的旧模块，重建同名文件会让 grep 与 git 历史产生歧义。
- [x] 4.10 新增路由 `GET /api/notify/due`：返回给定时间窗口内将触发的提醒（含重复规则展开），仅限本人
  - **路径与任务原文不同（`/api/notify/due` 而非 `/api/reminders/due`）**：既然数据一并移到了 `notify.json`，让路由前缀与存储文件名一致，避免出现"reminders 路径读写 notify 文件"这种需要解释的组合。design.md 里提到 `/api/reminders/due` 的地方属示意，以本实现为准。
  - 重复规则在**服务端**展开为具体实例，手机端只负责排程，不重复实现重复语义。
  - `?windowDays=` 可调，默认 `NOTIFY_DUE_WINDOW_DAYS`（7 天），上限 30 天。
  - **路由顺序有要求**：`/api/notify/due` 必须在 `/api/notify/:id` 之前匹配，否则 `due` 会被当成 id。已在 `index.ts` 中按此顺序放置并注释说明。
  - 返回 `{due, missed, window}`：`missed` 单独给出"已过期且从未送达"的条目，**不进入 `due` 因此不会被排程、不会补发通知**（spec 的「长时间失效后的处理」）。
- [x] 4.11 提醒读取路径接入 3.4 的归一化，确保结构异常不导致 500；**确认不读取 `reminders.json`**
  - `loadNotifyIndex` 对 JSON 解析失败与结构异常均回退到空集合，不让单个损坏文件使整个功能不可用。
  - `aiStrategies.ts` 与全部新路由均无 `USER_REMINDERS_PATH` 引用（grep 确认）。
  - 归一化语义按 spec 而非任务原文（原文写"丢弃无 `dueAt` 的条目"，与 spec 冲突，详见 3.4 的记录）：无 `dueAt` 保留、由 `isDeliverable` 排除在送达外。
- [x] 4.12 在 `aiStrategies.ts` 挂一个月度报告 cron 策略（默认关闭），并接上分派；确认不重新引入 `extract_todos`
  - 新增 `StrategyActionType` 成员 `monthly_expense_report`（`packages/shared/src/ai.ts`），并登记默认策略 `monthly-expense-report`（`enabled: false`、`cron: '0 1 1 * *'`、scope all）——**默认关闭**，因为它需要模型调用，不该在用户没选择时消耗配额。
  - `runCronStrategies` 从"显式空实现"改为**真实分派**，并加**日期门控**：worker 的 cron 是每天触发，月报只在每月 1–3 号生成（容忍 cron 漂移与月初短暂故障）。
  - `runMonthlyExpenseReports` 完成用户遍历与月份选择（上月），**跳过无消费数据的用户**以免写出一堆空笔记。
  - 按本轮决定，**AI 生成部分拆为 4.12b**（见下），当前函数不调用模型，因此启用该策略暂时不产生副作用。`extract_todos` 未被重新引入（grep 确认）。
- [ ] 4.12b 实现 `runMonthlyExpenseReports` 的 AI 生成部分：月度汇总 → 调 `ai.ts` 的 `chat()` 生成洞察 → 写成一篇 `visibility: private` 的笔记
  - **本轮按决定拆出**：它涉及模型调用、报告落点与失败重试，与"接线"不是一件事，混在一起做会让改动难以评审。
  - 落点已定（用户选择）：写成一篇 private 笔记。需注意 private 保证不公开，且笔记会出现在用户的目录树中，需要决定是否挂到某个栏目下。
- [x] 4.13 在 `index.ts` 接线路由，确认分类/汇总所需的 AI 调用走既有 AI 适配层与既有密钥配置
  - 15 条新路由已接入 `index.ts`；`aiStrategies.ts` 复用既有 `listKnownUserIds` 与 `loadExpenseMonth`。
  - 路由插入未破坏既有路由：本地 Worker 实测 `/api/public/tree` 与 `/api/public/feed` 仍返回 200。
  - 4.12b 实现时须走 `ai.ts` 的 `chat()`，复用既有 `AI_*` 密钥配置，不新增独立密钥。
- [x] 4.14 校验私密边界：未登录访问返回 401；跨用户不可达由构造保证
  - **实测**：本地 `wrangler dev` 起 Worker 后，逐条请求 14 个新端点且不带凭据，**全部返回 401**（`/api/notify` GET/POST、`/api/notify/due`、`/api/notify/:id` PATCH/DELETE、`/api/notify/:id/delivered`、`/api/tracking/usage` GET/DELETE、`/api/tracking/usage/sync`、`/api/tracking/usage/dates`、`/api/tracking/expenses` GET、`/api/tracking/expenses/bulk`、`/api/tracking/expenses/:id` PATCH/DELETE）。
  - **对任务原文的一处修正**：原文要求"未登录返回 404（不是 403）"。实际约定是——本仓的 404 用于**隐藏存在性**：私密笔记经公开路由访问时返回 404（见 `docs/DEPLOY-GUIDE.md` §7.3）；而"未登录"一律 401，与既有 `/api/notes`、`/api/plan` 等行为一致。若在新路由里对未登录返回 404，反而与既有 API 不一致。
  - **跨用户不可达是构造上的**：所有新路由的归属只取 JWT 里的 `user.id`，从不采信请求体或查询串里的 `userId`，文件路径也因此固定在自己的 `data/users/{userId}/` 下。不存在"他人身份可访问"的入口，故无 404 分支可测。此性质已通过代码走查确认。
  - 这些路径全部位于 `data/users/{userId}/` 之下，不经由任何 `/api/public/*` 出口，因此满足 spec 的「公开途径不可达」。
- [ ] 4.15 用 `npm run dev:api` + 手工请求或 `scripts/smoke-test.mjs` 验证 4.3–4.10 的幂等性：同一天上报两次、同一 `dedupeKey` 上报两次，均只留一条
  - **部分完成**：幂等逻辑本身已有断言覆盖（`scripts/assert-companion-models.mjs` 的 54 项，含"同日期覆盖"、"同 `dedupeKey` 合并为一条"、"跨分钟视为两笔"、"人工修正不被覆盖"）。`workers/api/.dev.vars` 已确认存在且 9 个键均有值，Worker 能本地起来。
  - **未完成的部分需要你决定**：端到端幂等验证要带真实 JWT 调本地 Worker，而写入会**落到你的真实 GitHub 数据仓** `data/users/{你的 userId}/`。我不能擅自写你的生产数据，因此这一步留给本人执行。
  - 建议做法：登录后从浏览器 devtools 取 `access_token`，然后对 `http://127.0.0.1:8787` 连发两次同一批数据，确认返回的 `added`/`merged` 与最终文件内容符合预期。若希望我代跑，请明确授权写入该数据仓。
  - **补充（真机测试发现）**：线上 Worker 一度对新路由返回 **404**，原因是 `workers/api` 的改动**从未部署**——前端连的是 `https://webbook-api.1060707057.workers.dev`，而新路由只存在于本地源码。已执行 `npm run deploy:api` 并复验：`/api/tracking/usage`、`/api/tracking/usage/dates`、`/api/tracking/expenses`、`/api/notify`、`/api/notify/due`、`/api/tracking/usage/sync` 全部由 404 变为 **401**（路由存在、需登录），`/api/public/tree` 仍 200。
  - **教训**：本地 typecheck 通过 ≠ 用户能用。Worker 属于"必须显式部署才生效"的一侧，本轮此前一直漏做这一步。

## 5. Web 端（apps/web）

- [x] 5.1 `lib/api.ts` 新增使用统计、消费、提醒的客户端方法
  - 落地 17 个方法：`syncUsage` / `loadUsageDay` / `loadUsageRange` / `loadUsageDates` / `deleteUsageRange`、`submitExpenses` / `loadExpenseOverview` / `setExpenseCategory` / `deleteExpense`、`loadNotify` / `createNotify` / `patchNotify` / `deleteNotify` / `loadNotifyDue` / `markNotifyDelivered`。全部带 `token`。
- [x] 5.2 新增能力探测：启动时判定四项可用性（浏览器中访问时全部为不可用且不报错）
  - 落地 `apps/web/src/lib/nativeBridge.ts`（探测与三个桥的访问层）+ `apps/web/src/store/useNativeHostStore.ts`（状态），在 `App.tsx` 的 `Routed` 里挂载时探测一次。
  - **两层判据**：先 `Capacitor.isPluginAvailable()`，再**真的调一次**（`Usage.daily` 取昨天、`Pay.drain`、`Alarm.schedule({alarms: []})`）。之所以不只信前者，是因为"已注册但调用失败"是真实存在的状态——Phase 0 探针那次就是桥没就绪而页面照常渲染。任一层失败即按不可用处理。
  - **`probeNativeBridge()` 保证不抛异常**：所有环节包 try/catch，失败返回 `NO_NATIVE_CAPABILITIES` 并附诊断信息（`capacitorGlobal` / `platform` / `error`）。这是 Phase 0 探针 v1 的直接教训——诊断代码不能假设被测对象存在。
  - 未复用 `lib/shellContext.ts` 的 `isInstalledShell()`：它靠 `android-app://` referrer、`display-mode: standalone`、UA 里的 `wv` 标记判定，而打包版宿主从 `https://localhost` 加载的是普通 WebView 页面，**没有这些标记**，因此不适用于"是否运行在 WebBook 宿主内"。宿主判定必须走插件调用。该文件本组未做任何改动。
- [x] 5.3 新增 `/app/usage` 页面：默认展示最近一个已完成自然日，含总时长与各应用时长排行、占比、日期切换
  - 落地 `apps/web/src/pages/UsagePage.tsx`。默认日期为**昨天**（"最近一个已完成的自然日"），并给出「昨天 / 前天」快捷切换与日期选择器（上限为昨天，避免选到未结束的今天）。排行按时长降序（归一化已保证），每行含时长、占比、启动次数与条形图。
- [x] 5.4 `/app/usage` 增加时间跨度趋势视图，缺失日期以空缺呈现而非零值
  - 7 / 14 / 30 天三档。柱状图按日期槽位渲染：**无数据的日期渲染为虚线空心柱**并在图注说明"不是当天没用手机"，与"零使用"明确区分。
- [x] 5.5 `/app/usage` 在无权限时展示授权引导与前往系统设置的入口，不展示伪造的零值数据
  - 无权限时整个数据区不渲染，改为 `PermissionGuide`（说明用途 → 跳系统设置 → 自动重新探测）。数据为空时展示空态而不是 0 值。
- [x] 5.6 新增 `/app/expense` 页面：默认当前月，含月度总额、类别占比、明细列表
  - 落地 `apps/web/src/pages/ExpensePage.tsx`。总额 + 类别堆叠条 + 类别占比列表（含金额与百分比）+ 明细（商户、时间、渠道、金额）。
- [x] 5.7 `/app/expense` 支持月份切换，无记录月份显示空状态
  - 上一月 / 回到本月。无记录时空态文案按是否已授权而不同（已授权说"支付后会自动记账"，未授权指向通知使用权）。
- [x] 5.8 `/app/expense` 支持就地改类别与删除、以及「未分类」记录的集中归类
  - 明细行内 `<select>` 改类别、删除按钮删误记；两者都**先本地乐观更新再回滚**，避免每次操作等一个来回。改类别后会重拉汇总，因为服务端同时把「商户 → 类别」沉淀成规则（并提示用户"该商户后续会自动沿用"）。
  - 「未分类」集中归类：有未分类记录时出现一条可切换的通知条，点击后列表只显示未分类项，便于逐条处理。
- [x] 5.9 新增提醒编辑界面：列表、创建（含日期时间与重复方式选择）、修改、完成、删除
  - 落地 `apps/web/src/pages/NotifyPage.tsx`。创建区含标题、备注、`datetime-local` 触发时刻、重复方式下拉；列表支持标记完成与删除。
  - 表单可直接留空触发时刻提交——此时创建的是"仅记录、不定时"的提醒（spec 允许该形态），`dueAt` 不写。
- [x] 5.10 提醒界面展示排程状态，区分"已排程"与"已送达"，并把过期未送达项以列表呈现（不补发通知）
  - 每条可送达的提醒带状态徽标：**已排程（info）/ 已送达（ok）/ 已错过（warn）**，依据 `notifiedAt` 与 `isMissed()`。
  - **过期未送达单独成区块**，文案明确写"不会补发通知"（spec 的「长时间失效后的处理」），并提供"知道了"逐条消除。
  - 另有「同步到手机」按钮：走 `/api/notify/due` 取**服务端已展开的实例**再交给 `ReminderAlarm`，而不是用列表里的 `dueAt`——否则重复提醒会退化成单次。
- [x] 5.11 确认新增页面未改动任何既有页面与路由；在浏览器中访问三个新页面时显示"需在手机 App 中使用"的降级提示
  - 新增三条路由 `/app/usage`、`/app/expense`、`/app/notify`（均 lazy）；`App.tsx` 只新增 lazy 声明、三条 Route 与一次探测 useEffect，既有路由一行未改。
  - 新增独立样式文件 `apps/web/src/styles/companion.css`（在 `main.tsx` 中引入），**不修改既有 CSS**；只用 `theme.css` 的语义 token，因此三套皮肤自动适配。已确认 `.page` / `.page-head` 类名此前未被占用，不存在冲突。
  - 降级提示：使用统计与账单在能力不可用时显示权限/引导说明；提醒页显示"需在手机 App 中使用"（并说明网页端仍可管理内容）。浏览器中三页均不报错，探测返回全 false。
- [x] 5.11b **补上导航入口**（5.11 的遗漏，由真机测试发现）
  - **问题**：三条路由建好了，但**没有任何界面入口**——真机装上后用户找不到账单页。这是一个真实缺陷：功能存在但不可达，等于不存在。
  - 入口放在 `AccountMenu`（账户下拉）新增的「手机伴侣」分组：使用统计 / 账单 / 提醒。
  - **为什么放账户菜单而不是底栏**：`MobileNav` 已有 4 项且 `m-nav-item` 是 `flex:1`，第 5 项会挤压触摸目标；这三页是低频入口（看统计、对账、管提醒），不值得占用一等导航位。已核实账户菜单是 `position: fixed` portal，唯一相关的移动端规则是把菜单**加宽**，因此在任何宽度下都可达。
  - **顺带修掉一个被这次改动暴露的缺陷**：`MobileNav` 的 `onNotes` 用 `path.startsWith('/app')` 判定，会把 `/app/usage`、`/app/expense`、`/app/notify` 误判成「笔记」页 → 底栏高亮错误，用户会以为自己还在笔记区。已加 `onCompanion` 排除。
  - **仍待评估**：这三页目前只在账户菜单里，发现性一般。若日后成为高频入口，应提升到顶栏（`ShellTopBar` 已有「任务中心」按钮这个先例可循）。本轮不做，避免为低频功能先付出导航复杂度。
- [x] 5.12 `npm run typecheck -w apps/web` 通过；`npm run lint` 不新增 error
  - `typecheck` 通过；`npm run build` 成功（616 modules），三个新页面各自产出 chunk（`UsagePage` 5.5KB / `ExpensePage` 6.0KB / `NotifyPage` 6.2KB），`companion.css` 已并入样式产物。
  - `lint` 结果与组 4 结束时一致（16 errors，全部为既有 `BlockEditor` 的 `rules-of-hooks` 与两处设计稿原型未使用变量），**本组未新增任何 error**。

## 6. 宿主外壳与原生桥（apps/android-cap）

- [x] 6.1 按 Phase 0 的结论固化 Capacitor 配置（远程加载或打包，二选一）
  - 已固化为**打包进包**：`capacitor.config.ts` 的 `webDir` 指向 `../web/dist`，**刻意不设置 `server` 字段**，并在文件头写明原因（远程注入分支未经验证且失败时静默）。
  - 三模式分流：缺省 bundle（真机使用）/ `WEBBOOK_CAP_MODE=probe`（诊断页）/ `--remote-probe` 已随 D1 改判删除。
  - 已核验打包产物：`apps/android-cap/dist/webbook-host-bundle.apk` 的 `capacitor.config.json` 内**无 `server` 字段**，`assets/public/` 含完整 web 产物。
- [x] 6.2 接入登录所需的 WebView 设置（会话持久化、域名白名单）
  - 会话持久化：打包后页面源为 `https://localhost`（安全上下文），localStorage 在 WebView 中随应用数据持久化。**真机已验证**：在宿主内用邮箱密码登录成功。
  - 域名白名单：打包模式下**不需要** `server.allowNavigation`——页面与所有资源都来自本地资产，Worker API 是绝对 URL 的跨域请求（Worker 侧 `Access-Control-Allow-Origin: *` 已放行，真机验证过能读到目录树与笔记）。
  - `webContentsDebuggingEnabled: true`：保留以便用 `chrome://inspect` 排查 WebView 内问题——探针那轮的教训是"没有设备侧证据就只能靠猜"。
  - 已打开 `android:allowBackup="true"` 的判断：保持 Capacitor 默认值，未改动。
- [x] 6.3 在 `AndroidManifest.xml` 声明所需权限：`POST_NOTIFICATIONS`、`PACKAGE_USAGE_STATS`、`SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`、`RECEIVE_BOOT_COMPLETED`
  - 已声明并**在合并后的 manifest 中核验**（`merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml`）：`POST_NOTIFICATIONS`、`PACKAGE_USAGE_STATS`、`SCHEDULE_EXACT_ALARM`、`USE_EXACT_ALARM`、`RECEIVE_BOOT_COMPLETED` 全部在位。
  - 同时声明了 `PayListenerService`（带 `BIND_NOTIFICATION_LISTENER_SERVICE` 权限）、`AlarmReceiver`、`BootReceiver`（含 `BOOT_COMPLETED` / `LOCKED_BOOT_COMPLETED` intent-filter），均已核验进包。
  - 三处注释写明了易踩的点：① `PACKAGE_USAGE_STATS` 是**特殊权限**（AppOps），`uses-permission` 只是声明，真授予要去系统设置；② `SCHEDULE_EXACT_ALARM` 在 Android 12+ 可被用户撤销，`USE_EXACT_ALARM` 是 API 33+ 免申请版本但仅限闹钟/日历类应用，故两者都声明、运行时按 `canScheduleExactAlarms()` 择一；③ 未授予通知使用权时系统**不绑定监听服务且不报错**，所以"已授权"与"已连接"必须分开检查。
  - 需要 `xmlns:tools` 才能用 `tools:ignore="ProtectedPermissions"` 抑制 `PACKAGE_USAGE_STATS` 的 lint 警告，已补上命名空间。
- [x] 6.4 实现 `ReminderAlarm` 插件：接收一组 `{id, dueAt, title, body}`，重建本地排程并返回实际排入数量；`PendingIntent` 使用由提醒 id 派生的稳定 request code
  - 落地 `ReminderAlarmPlugin.java`。**语义是"提交即重建"**：先取消本应用全部排程再按传入的这组重建，因此调用方必须提交完整窗口内容（`/api/notify/due` 本就返回完整窗口，重建比 diff 简单且不会漂移）。
  - 幂等靠 `AlarmReceiver.stableId(id)` 派生的稳定 requestCode——否则"同一次触发送两次通知"必然发生。
  - **已过去的时刻不排**（计入 `skipped`）：补发过期通知会造成骚扰，spec 明确要求不补发。
  - 排程时写**影子副本**（SharedPreferences，只含 id/dueAt/title/body 四个字段）供开机重建；取消时逐个 `cancel` 而非记录总 PendingIntent，因为每个提醒各有自己的 requestCode。
  - `setExactAndAllowWhileIdle` 优先（Doze 下可触发，且不像 `setAlarmClock` 那样在状态栏常驻闹钟图标）；无精确权限时**降级为 `setAndAllowWhileIdle` 并如实上报**，而不是静默失败。
- [x] 6.5 实现闹钟接收器：到点通过 `NotificationManager` 投递通知，通知内容含标题与正文
  - 落地 `AlarmReceiver.java`。走 BroadcastReceiver + NotificationManager——到点必须在应用未打开甚至被回收时也能弹出，这是唯一不依赖应用进程存活的路径。
  - **修掉一个真机证实的静默失效**：探针在小米 23049RAD8C 上发现「通知展示权限」被拒时闹钟照常触发，但 `nm.notify()` 抛 SecurityException，用户什么都看不到。现在该异常被记录（`lastDeniedCount` / `lastDeniedAt`）并由 `checkPermissions` 上报给界面，用户能看到"提醒在响但你收不到"，而不是以为功能坏了。
  - 通知 id 与 PendingIntent requestCode 同源，保证同一次触发覆盖而非叠出多条。
- [x] 6.6 实现开机重建：设备重启后恢复闹钟排程
  - 落地 `BootReceiver.java`（探针阶段的占位实现已替换为真实重建）。开机广播里没有 Activity/Plugin 实例，因此新增 `WebBookApp` 持有进程级 Context 供读取影子副本。
  - **关机期间已过期的实例不重建**（spec 的「长时间失效后的处理」：恢复后不集中补发过期通知）；重建结果只保留仍在未来的项，避免影子副本随时间无限累积。
  - 重排被拒（权限被撤销）时**保留影子副本**，等下次开机或权限恢复再试，而不是丢弃。
- [x] 6.7 实现 `UsageStats` 插件：按给定日期返回该日各应用包名、显示名、前台毫秒数、启动次数及总时长
  - 落地 `UsageStatsPlugin.java`。**两条取数路径都实现**：`queryUsageStats` 优先，结果不可信时自动回退 `queryEvents`，并在返回里注明实际用了哪条（`source` / `fallbackUsed` / `statsAppCount` / `eventsAppCount`）。
  - **为什么不赌一条**：本轮探针只确认了权限已授予，未拿到两条路径的对比结果。若只实现一条而它在目标 ROM 上返回空，功能会表现为"权限给了也没数据"。
  - **"可信"的判定是"有没有拿到有时长的应用"，而不是"调用有没有抛异常"**——ROM 限制的表现恰恰是不报错但返回空，异常反而是少见的好情况。
  - `queryEvents` 路径把 RESUMED/PAUSED 配对成会话；未闭合的 RESUMED（关机、强杀）按**窗口末尾兜底**而非丢弃，否则最后使用的应用会凭空消失。
  - 同一包名的多个日桶会合并，避免跨天边界重复计。
- [x] 6.8 实现应用数上限与"其他"合并，保证该日总时长仍准确
  - **刻意不在原生实现**：上限合并与 `totalMs` 重算在 `packages/shared/usage.ts` 的 `capUsageApps` / `normalizeUsageDay` 里，这两处同时被 Worker 与断言脚本使用；若在原生再实现一份，三处口径可能不一致。本插件只负责把该日事实取回来。
  - 由 3.2 的 54 项断言覆盖（含"截断后总时长必须不变"）。
- [x] 6.9 实现 `PayListener` 插件：以 `NotificationListenerService` 收听通知，仅保留来源属于微信支付或支付宝的条目，返回 `{title, text, pkg, postedAt}` 原始字段
  - 落地 `PayListenerService.java`（监听）+ `PayListenerPlugin.java`（桥）。只保留 `com.tencent.mm` 与 `com.eg.android.AlipayGphone`，其余渠道的通知**直接丢弃、不入缓冲、不落盘**。
  - 正文取 `EXTRA_TEXT` / `EXTRA_BIG_TEXT` / `EXTRA_TEXT_LINES` 里**最长的那个**——部分通知把正文放在 BIG_TEXT，只读 EXTRA_TEXT 会拿到空或截断内容。
  - 真机已验证：截图显示"累计收到通知 7 / 其中微信支付宝 6"，说明渠道判断生效且缓冲在积累。
- [x] 6.10 确认 `PayListener` 不落盘原始通知文本、不做任何金额或商户解析
  - 已确认：`PayListenerService` 无文件写入，缓冲区是 `static List`，`drain()` 取走即 `clear()`。全部 Kotlin/Java 侧**没有任何金额或商户正则**——解析规则写在原生意味着微信改文案就要重新出包，写在 TypeScript 则随网页更新（design.md D2）。
  - 缓冲上限 200 条，防止长期未取时无限增长。
- [x] 6.11 实现 `onListenerDisconnected` 重连与周期性健康检查，避免通知监听被系统解绑后静默失效
  - `onListenerDisconnected` 里**主动 `requestRebind`**：系统会自动重绑但间隔不确定，主动请求能明显缩短"支付不再被记录"的窗口期——而这段窗口用户是察觉不到的。同时累计 `disconnectCount` 与时间戳。
  - 新增 `PayListenerPlugin.healthCheck()`：先探测「已授权但未连接」，仅在此时才请求重绑（未授权时重绑无效且会污染系统日志），并返回一个可直接展示的 `state`（`ok` / `not_granted` / `disconnected` / `rebinding`），省得界面自己拼逻辑。
  - Web 侧封装为 `checkPayListenerHealth()`，供启动与周期同步调用。
- [x] 6.11b **接管 Android 返回键 / 侧滑手势**（真机测试发现）
  - **问题**：Capacitor 的默认行为是"没有注册 `backButton` 监听器时，返回键直接退出应用"。Android 上侧边滑动就是系统返回的一种触发方式，因此真机表现为**打开账单页后一滑就退出，回不到上一层**。整个前端此前没有任何返回键处理（已 grep 确认）。
  - 落地 `apps/web/src/lib/backButton.ts`，在 `App.tsx` 的 `Routed` 里挂载一次。
  - **判定不靠猜**：`BackButtonListenerEvent` 自带 `canGoBack`（浏览器历史是否还能后退），这是可靠信号。逻辑为：入口路由（`/app`、`/blog`、`/admin`、`/login`、`/`）→ `exitApp()`；否则 `canGoBack` 为真 → `history.back()`；为假（历史已到底）→ `exitApp()`。
  - **为什么要单独判入口路由**：无条件 `history.back()` 会让用户永远退不出应用；只信 `canGoBack` 则可能在首页回退到同一页（打包版启动时历史里可能已有初始化跳转产生的一条记录）。两者结合才是 Android 的标准手感。
  - **浏览器中无副作用**：`Capacitor.isNativePlatform()` 为 false 时整个监听不注册——网页端有自己的返回按钮，接管它会破坏正常浏览体验。
  - 全程 try/catch：返回键处理绝不能抛异常，否则用户按返回会导致应用崩溃，比"退不出去"严重得多。
  - **一个部署陷阱**：`@capacitor/app` 的原生类（`com.capacitorjs.plugins.app.AppPlugin`）来自该包自己的 `android/` 目录，**必须装在 `apps/android-cap` 而不是 `apps/web`**，否则 `cap sync` 的插件发现扫不到它、`capacitor.plugins.json` 为空——而前端代码照常打包进去，表现为「代码在但插件不存在」的静默失败。已核验 `capacitor.plugins.json` 含该条目且 `AppPlugin` 进了 dex。
- [ ] 6.12 接入 `WorkManager` 周期任务（2 小时量级）：拉取待触发提醒 → 重排闹钟 → 上报积压的用量与消费
  - **尚未开始**。它依赖 8.x（用量采集编排）与 9.x（通知解析与上报）的 Web 层逻辑——WorkManager 本身只是"到点唤醒"的壳，被唤醒后要执行什么属于那两组。建议在 8.x / 9.x 落地后再接，避免空转。
- [x] 6.13 实现能力探测接口，供 Web 层查询四项能力可用性
  - 三个插件各自暴露权限查询：`ReminderAlarm.checkPermissions`（含 `canScheduleExactAlarms` / `canPostNotifications` / `scheduledCount` / `lastFired` / `notificationDenied`）、`UsageStats.hasPermission`、`PayListener.hasPermission` 与 `healthCheck`。
  - Web 侧 `lib/nativeBridge.ts` 据此实现 `probeNativeBridge()`（两层判据：`isPluginAvailable` + 真调一次）、`checkAlarmPermissions`、`checkPayListenerHealth`。
  - 探针插件 `ProbePlugin` **保留在主工程里**：它无需改代码就能确认三项权限与桥状态，Phase 0 已证明这个能力省下的排查时间远超其体积。
- [x] 6.14 实现两个特殊权限的申请引导（说明用途后跳转系统设置），两项互相独立
  - `UsageStats.requestPermission()` 跳 `ACTION_USAGE_ACCESS_SETTINGS`；`PayListener.requestPermission()` 跳 `ACTION_NOTIFICATION_LISTENER_SETTINGS`；`ProbePlugin.openSettings` 另支持闹钟与应用通知两页。全部带异常回退（厂商定制 ROM 上 Intent 可能不存在）。
  - Web 侧三个页面各自有 `PermissionGuide`：**先说明用途与数据去向，再跳转**，跳转后自动重新探测。三项权限互不牵连——拒绝其一不影响其余功能（spec 要求）。
  - **新增一条界面义务**：`canPostNotifications === false` 时必须在提醒页明确提示"提醒会响但你看不到"。这不是可选项——真机已证实该状态下功能表现为完全失效。
- [x] 6.15 构建可安装的签名的 APK，并在 `package.json` 增加对应脚本（不覆盖既有 `android:apk`）
  - `scripts/android-cap-apk.mjs` 已就位（`--probe` / `--release` / `--skip-web-build`），但**尚未加到根 `package.json` 的 scripts**。留待本组收尾时补，并把命名与既有 `android:apk`（TWA）明确区分。

## 7. 提醒同步与送达

- [x] 7.1 Web 层接入 `GET /api/reminders/due`，把窗口内实例提交给 `ReminderAlarm` 排程
- [x] 7.2 实现本地排程与云端集合的收敛：云端删除的提醒，本地排程在下次唤醒后被移除
- [x] 7.3 实现同一次触发不重复送达（稳定的通知 id 与去重）
- [x] 7.4 实现送达后回写 `notifiedAt`，使云端可区分"已排程"与"已送达"
- [x] 7.5 实现重复规则的下一次实例排入（`daily` / `weekly` / `weekdays`）
- [x] 7.6 实现"长时间失效不补发"：恢复后把过期项以列表呈现，不集中弹通知
- [ ] 7.7 真机验收：在网页端创建一条 2 分钟后触发的提醒，确认手机到点弹出；把手机断网后重复一次，确认离线仍能触发

## 8. 使用统计采集与展示

- [x] 8.1 Web 层接入 `UsageStats`，采集"上一个已结束的自然日"
- [x] 8.2 实现补采：设备长期离线后补采最近若干天，且有明确回溯上限
- [x] 8.3 实现批量上报与幂等（同日期重复上报以最近一次覆盖）
- [x] 8.4 实现未授权时不采集、不上报，且不产生零值日期记录
- [ ] 8.5 真机验收：能看到昨日总时长与各应用耗时排行，抽查一两个应用与系统自带的屏幕时间统计对比是否合理

## 9. 消费记账与分类

- [x] 9.1 Web 层实现通知解析：从原始标题/正文抽出金额（以分为单位整数）、商户、发生时刻、来源渠道
- [x] 9.2 实现拒绝规则：转账、退款、收款、余额变动、优惠券到账、失败支付均不产生支出记录
- [x] 9.3 实现幂等键计算与本地去重（同笔支付的重复通知合并为一条；金额商户相同但时刻明显不同的保留两条）
- [x] 9.4 实现无法解析的通知进入"待修正"记录，保留可审计痕迹且不中断后续解析
- [x] 9.5 实现本地队列与节流上报（攒够 N 笔或距上次超过 T），确认原始通知文本不上报
- [x] 9.6 实现分类：先查 `rules.json`，未命中才调 AI，成功后把「商户→类别」写回规则
- [x] 9.7 实现 AI 不可用时归入「未分类」，仍计入月度总额且可手工归类
- [x] 9.8 实现用户修正：改类别即沉淀为规则；删除误记从汇总中扣除
- [ ] 9.9 真机验收：实际完成一笔微信支付与一笔支付宝支付，确认记录在预期时间内出现在当月账单；核对金额、商户与类别
- [ ] 9.10 边界验收：核对 `dedupeKey` 是否真的抑制了重复通知，并统计一次实际覆盖率，把未识别形态记录为后续解析规则的输入

## 10. 降级与边界

- [ ] 10.1 逐项验证：拒绝通知展示权限、拒绝使用情况访问权限、拒绝通知使用权、拒绝精确闹钟权限，四种情况下应用均不崩溃且其余功能可用
- [ ] 10.2 验证权限在系统设置中被事后撤销时，应用能感知并切换为对应的降级状态
- [ ] 10.3 验证浏览器访问时三个新页面均显示降级提示且无控制台错误
- [ ] 10.4 验证离线场景：断网期间的提醒、用量、消费均不丢失，恢复后按序补报且不重复

## 11. 文档

- [x] 11.1 更新 `docs/REQUIREMENTS.md`：§5 非目标中移除「账单模块」，§4 新增使用统计与消费记账条目
- [x] 11.2 确认 `docs/REQUIREMENTS.md` 的 A-04 采用 `webbook-node-planner` 的改写结果，不产生冲突
- [x] 11.3 更新 `docs/DEPLOY-GUIDE.md`：宿主构建方式、两个特殊权限的授予路径与用途说明、数据仓新增目录结构
- [x] 11.4 更新 `README.md` 的目录结构与路线图（账单模块从「待办示例」转为已实现）
- [x] 11.5 记录回滚方式：卸载新宿主、继续使用既有 TWA/PWA，服务端新增路由与数据不影响既有功能

---

## 11b. 实现收尾记录（2026-09-26）

### 已完成的实现类任务（无需真机）

| 组 | 内容 |
|---|---|
| 2.11 | 探针页移出随包产物：`apps/web/public/__cap-probe/` 已删，生成器保留在 `apps/android-cap/scripts/`。已核验 `dist/` 与 APK 内均不再含该路径 |
| 6.15 | 根 `package.json` 新增 `android:companion` 与 `android:companion:probe`，与既有 `android:apk`（TWA）明确区分 |
| 7.1–7.6 | `apps/web/src/lib/deviceSync.ts` 的 `syncReminders()`：**回写送达 → 拉取待触发 → 重建本地排程**，三步顺序不可换。`AlarmReceiver` 改为**累积**记录已触发项（而非只留最近一次，否则批量回写会漏），新增 `ReminderAlarmPlugin.drainFired()` |
| 8.1–8.4 | `captureAndUploadUsage()`：按回溯上限采集、跳过无数据日期（**不产生零值记录**）、以「用户+日期」幂等上报。未授权时 `fetchUsageDay` 返回 null，天然满足"未授权不采集" |
| 9.1–9.8 | `packages/shared/src/paymentParse.ts`（解析 + 拒绝 + 幂等）与 `saveExpensesBulk` 的服务端归类。解析放 shared 而非 web，使 Worker、断言脚本、前端跑**同一份实现** |
| 11.1–11.5 | `docs/REQUIREMENTS.md`（新增 §4.9 手机伴侣、§5 移出两条非目标、§8 变更记录）；`docs/DEPLOY-GUIDE.md`（新增 §十一 Android 宿主、§5.6 API、§十 部署提醒，章号顺延）；`README.md`（特性、目录结构、路线图、APK 命令） |

### 实现中修掉的两个**真实解析 bug**

两个都是断言先失败、我去查原因才发现的，**不是测试写错**：

1. **`收款` 裸匹配把所有正常支付都拒掉了。** 初版 `income` 规则是 `/收款|.../`，而微信支付通知里
   「**收款方**：瑞幸咖啡」是商户字段标签、属于支出语境。已改为只匹配明确表示"钱进来了"的
   完整短语（`收款成功` / `收款到账` / `已收款` / `收入`），并把原则写进注释：
   **宁可写长短语，也不要写会出现在支出文案里的短词**。

2. **商户正则把金额一起吞了**，得到 `瑞幸咖啡 ¥18.00`。已加清理：砍掉从"空白+货币符号/数字"
   开始的部分。这不只是脏数据——**同一家店会因金额不同被当成不同商户**，直接破坏规则沉淀。

### 关键设计选择（供后续维护）

- **送达回写单独端点**（`POST /api/notify/:id/delivered`），不在通用 `PATCH` 暴露 `notifiedAt`：
  否则客户端可伪造"已送达"，"已排程 vs 已送达"的区分就失去意义。
- **归类在服务端**：规则文件在数据仓、AI 密钥是 Worker secret，放前端既拿不到密钥也保证不了一致性。
- **上限合并不在原生实现**：`capUsageApps` / `normalizeUsageDay` 在 `packages/shared`，Worker 与
  断言脚本共用；原生再实现一份会导致三处口径不一致。
- **待提交队列只存内存**（`deviceSync` 的 `PENDING_KEY`）：原始通知文本不得落盘（design D2）。
  代价是应用被杀时队列丢失，换来"原始文本永不落地"这条硬约束。

### 断言覆盖

`scripts/assert-companion-models.mjs` 从 54 项增至 **89 项**。新增 35 项覆盖支付解析：成功抽取
（金额/商户/渠道）、7 条拒绝规则、跨分钟视为两笔、批内 `dedupeKey` 合并、裸数字不被当金额、
非声明渠道被忽略、解析结果能直接通过 `normalizeExpense`。

> 这些断言用的是**按公开形态构造的通知文案，不是真机原文**。因此验证的是"解析器行为正确"，
> 而不是"文案一定长这样"。拿到 2.7 的真实样本后应补进去作为回归夹具。

### 本轮已部署

- Worker 已 `deploy` 两次（新增路由 + 服务端归类），线上复验：`/api/notify`、`/api/notify/due`、
  `/api/tracking/usage`、`/api/tracking/usage/dates`、`/api/tracking/usage/sync`、
  `/api/tracking/expenses`、`/api/tracking/expenses/bulk` 全部 401（路由存在需登录）；`/api/public/tree` 仍 200。
- APK 已重建，核验：探针页不再入包、6 个关键类均在 dex、`@capacitor/app` 已在
  `capacitor.plugins.json`。

### 仍未完成（全部需要真机或授权）

| 任务 | 阻塞原因 |
|---|---|
| 2.6 / 2.7 / 2.8 / 2.9 | 真机操作；`queryUsageStats` vs `queryEvents` 对比结果与通知原文仍缺 |
| 4.12b | 落点已定（private 笔记），实现留待后续 |
| 4.15 | 端到端幂等验证要写真实数据仓，需明确授权 |
| 6.12 | 依赖的编排已就位，可开始 |
| 7.7 / 8.5 / 9.9 / 9.10 | 真机验收 |
| 10.1–10.4 | 需逐项在系统设置里拒绝权限来验证降级 |
| 12.1–12.5 | 端到端走查与 spec 逐条确认 |

## 12. 端到端验收

- [ ] 12.1 全链路走查：网页端创建带时刻的提醒 → 手机到点通知 → 送达状态回写网页端可见
- [ ] 12.2 全链路走查：连续两天的使用统计在网页端可查看、可切换、占比之和正确
- [ ] 12.3 全链路走查：一笔支付在手机产生记录、在网页端可见、可改类别、可删除，月度占比随之更新
- [ ] 12.4 汇总 Phase 0 spike 的最终结论与实测覆盖率，更新 `design.md` 的 Open Questions 状态
- [ ] 12.5 对照 `openspec/specs` 下四个能力的所有 Scenario 逐条确认，把未覆盖项记录为后续变更
