## Why

WebBook 能记录内容，却无法规划内容。现有的「提醒 / 快记」是一份扁平清单：它从笔记正文里正则抽取 `- [ ]` 行，没有嵌套、没有计划完成时间、没有进度，因此无法回答「这个栏目接下来要做哪些事、做到哪一步了」。真实的写作与项目工作天然分层（栏目 → 子栏目 → 笔记 → 子任务），扁平清单与它结构不匹配，用户只能用标题文字手动编码层级。

同时，`reminders` 的写入路径（`patchReminder`）是 read-modify-write 且无乐观锁，`github.ts` 把 409 当网络抖动直接重试。这在单条粒度上问题不明显，但任务规划是**一整棵树放在一个文件里**，两设备并发会静默丢掉整份规划。

## What Changes

- **新增规划数据模型**：`data/users/{userId}/plan.json` 存一棵嵌套任务树（`PlanNode`），字段含标题、备注、锚点、优先级、计划完成时间、完成状态与完成时间。新增 `packages/shared/src/plan.ts` 承载类型与纯函数（聚合切片、统计、祖先链）。
- **新增鉴权 API**：`GET /api/plan` / `PUT /api/plan`，权限与现有 reminders 一致（仅登录）。
- **新增乐观锁**：`GET` 返回 `baseSha`，`PUT` 携带 `baseSha`；Worker 侧比对失败返回 `409 conflict` 且**不重试**。前端收到 409 后重拉并重放本地操作。这是单文件多设备并发不丢数据的前提。
- **新增节点规划弹窗**：侧边栏笔记 / 栏目 hover 工具区（现有 ＋ ❏ ✎ 🗑 之后）新增规划按钮，打开三 tab 弹窗——TODO（可嵌套树）、已完成（按完成时间倒序 + 时间范围筛选）、信息统计（完成率 / 逾期 / 完成趋势 / 按优先级分布）。
- **父级自动汇聚**：打开栏目规划时，展示锚在该栏目**及其全部后代节点**上的任务，按结构自动汇成树。聚合在前端完成，Worker 不需要知道树的结构。
- **新增全局任务中心**：顶栏入口，复用同一套三 tab 组件，数据范围换为全库，并额外提供「未归类」分区与跨栏目统计。
- **新增任务操作**：标记完成 / 取消完成、嵌套新增、拖拽排序与改层级、直接删除 + 5 秒撤销 toast。
- **BREAKING** 下线「提醒 / 快记」：删除 `RemindersPanel`、三条 `/api/reminders` 路由、`workers/api/src/reminders.ts`、`aiStrategies.ts` 中的 `extract_todos` 定时动作、`packages/shared` 中的 `Reminder` / `RemindersIndex` 类型，以及 `PUT /api/notes/:id` 中的 `mergeTodosFromNote` 副作用。任务**只从规划弹窗创建**，笔记正文的 checkbox 恢复为普通文本。
- **新增一次性迁移**：首次加载规划时，把既有 `reminders.json` 中无主的快记条目搬进 `plan.json` 的「未归类」，保留原 id 与完成状态，迁移幂等。
- **更新文档**：`docs/REQUIREMENTS.md` 的 A-04 改写为「笔记规划任务树」，`docs/DEPLOY-GUIDE.md` 中 reminders 相关条目替换为 plan。

## Capabilities

### New Capabilities

- `task-plan`: 规划数据模型与持久化契约——`plan.json` 结构、锚定与父级汇聚语义、只算进度不回卷父任务、孤儿清理、乐观锁与 409 冲突语义、`reminders` 迁移。
- `task-planner-ui`: 规划界面契约——侧边栏节点规划入口、三 tab 弹窗（TODO / 已完成 / 信息统计）、拖拽排序与改层级、删除撤销、顶栏全局任务中心与未归类分区。

### Modified Capabilities

无。`openspec/specs/**` 下不存在描述提醒或待办行为的 spec，因此下线提醒不产生 delta；对应用户可见文档在 `docs/REQUIREMENTS.md`。

## Impact

**新增**
- `packages/shared/src/plan.ts`、`workers/api/src/plan.ts`、`apps/web/src/components/plan/*`

**修改**
- `packages/shared/src/paths.ts`（`USER_PLAN_PATH`）、`packages/shared/src/index.ts`、`packages/shared/src/ai.ts`（移除 Reminder 类型）
- `workers/api/src/index.ts`（新增 plan 路由，删除 reminders 路由与 `mergeTodosFromNote` 调用）、`workers/api/src/aiStrategies.ts`（移除 `extract_todos` 动作与 import）
- `apps/web/src/components/TreeSidebar.tsx`（新增规划按钮）、`apps/web/src/components/AppShell.tsx`（顶栏「提醒」→「任务」）、`apps/web/src/lib/api.ts`、`apps/web/src/lib/storage.ts`（规划折叠态）、`apps/web/src/styles/layout.css`
- `docs/REQUIREMENTS.md`、`docs/DEPLOY-GUIDE.md`

**删除**
- `apps/web/src/components/RemindersPanel.tsx`、`workers/api/src/reminders.ts`

**API 契约变更**
- 新增 `GET /api/plan` → `{ plan, baseSha }`；`PUT /api/plan` → body `{ plan, baseSha }`，冲突 `409`
- 删除 `GET /api/reminders`、`POST /api/reminders`、`PATCH /api/reminders/:id`
- `PUT /api/notes/:id` 不再产生 reminders 副作用（响应不变）

**数据兼容**
- 既有 `data/users/{userId}/reminders.json` 保留只读，供一次性迁移读取；迁移完成后不再写入，也不主动删除（保留回滚余地）。

**约束与风险**
- 单文件承担整棵树：任务量增长会线性放大每次写入的 payload 与 GitHub commit 体积。设计文档需记录可选的分片触发阈值。
- 删除栏目 / 笔记时其锚定任务**级联清理**（已确认的行为选择），需二次确认，且不可撤销。
- 游客不可用规划（与 reminders 一致），侧边栏按钮对游客提示登录。
