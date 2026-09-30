## 1. 共享层：类型与纯函数

- [x] 1.1 新建 `packages/shared/src/plan.ts`：定义 `PLAN_SCHEMA_VERSION = 1`、`TaskPriority = 'p0' | 'p1' | 'p2' | 'none'`、`PlanNode`（`id` / `title` / `note?` / `anchorNodeId?` / `done` / `createdAt` / `doneAt?` / `dueAt?` / `priority` / `children`）、`PlanDoc`（`schemaVersion` / `nodes` / `migratedReminders?`）
- [x] 1.2 在 `plan.ts` 实现 `createEmptyPlan()` 与 `createTask(partial)` 工厂，默认值为 `done: false`、`priority: 'none'`、`children: []`、`createdAt` 为当前 ISO 时刻
- [x] 1.3 实现 `normalizePlan(raw)`：按 schemaVersion 迁移到当前版本，补齐缺失字段，保留既有 id 与嵌套，容忍未知字段（对应 spec：Plan document）
- [x] 1.4 实现 `collectDescendantNodeIds(tree, nodeId)` 与 `collectSubtreeNodeIds(tree, nodeId)`（后者含自身），基于 `TreeNode.children` 纯遍历
- [x] 1.5 实现 `selectVisibleTasks(plan, visibleAnchorIds)`：返回锚点落在集合内的任务子树，保持 `children` 顺序；祖先链上有锚点的任务其子孙一并可见（对应 design D3）
- [x] 1.6 实现 `collectUnclassifiedTasks(plan)`：无锚且祖先链无锚的根任务（对应 spec：unclassified bucket）
- [x] 1.7 实现 `computeProgress(tasks)` 返回 `{ done, total }`，以及 `countDescendantTasks(node)`（不含自身）
- [x] 1.8 实现 `computePlanStats(tasks, now)`：总任务 / 已完成 / 完成率 / 逾期数 / 最近七天完成数 / 未完成按优先级分布；总数为 0 时完成率返回 0；无 `dueAt` 的任务不计入逾期（对应 design D7）
- [x] 1.9 实现树操作纯函数：`insertTask` / `removeTask`（返回被删子树）/ `moveTask(id, newParentId, index)` / `updateTask`，均返回新 `PlanDoc` 且不改动入参；`moveTask` 拒绝把任务移入自身后代
- [x] 1.10 实现 `isOverdue(node, todayStr)` 与日期工具：`toDateString(Date)` 输出本地 `YYYY-MM-DD`，`isWithinLastDays(doneAt, days, now)`；`dueAt` 一律字符串比较，不引入时区（对应 design D4）
- [x] 1.11 在 `packages/shared/src/paths.ts` 新增 `USER_PLAN_PATH(userId)` = `data/users/{userId}/plan.json`，保留 `USER_REMINDERS_PATH` 供迁移读取
- [x] 1.12 在 `packages/shared/src/index.ts` 导出 `./plan.js`
- [x] 1.13 运行 `npm run typecheck --workspace packages/shared` 通过

## 2. Worker：持久化与乐观锁

- [x] 2.1 在 `workers/api/src/github.ts` 新增 `putFileConditional(env, path, content, message, expectedSha)`：比对失败直接抛出带 `409` 标记的错误，**不进入重试循环**
- [x] 2.2 新建 `workers/api/src/plan.ts`：实现 `loadUserPlan(env, userId)`，无文件时返回空计划；读取时调用 `normalizePlan`
- [x] 2.3 在 `plan.ts` 实现 `loadUserPlanWithSha(env, userId)`，同时返回文件当前 sha 作为 `baseSha`（文件不存在时为 `null`）
- [x] 2.4 在 `plan.ts` 实现 `saveUserPlan(env, userId, plan, baseSha)`：`baseSha === undefined` 时走无条件写入；否则走 `putFileConditional`，返回新的 sha
- [x] 2.5 在 `plan.ts` 实现 `migrateRemindersIntoPlan(env, userId, plan)`：`migratedReminders` 已为 true 时直接返回；否则读 `reminders.json`，按 `id` 去重后追加无锚根节点（`title = r.text`、`doneAt = r.done ? r.createdAt : undefined`），置标记后写回（对应 design D8）
- [x] 2.6 运行 `npm run typecheck --workspace workers/api` 通过

## 3. Worker：路由

- [x] 3.1 在 `workers/api/src/index.ts` 新增 `GET /api/plan`：未登录返回 `401`；登录取用户的 plan 与 `baseSha`，先跑一次性迁移，返回 `{ plan, baseSha }`
- [x] 3.2 新增 `PUT /api/plan`：未登录返回 `401`；校验 body 含 `plan`，`normalizePlan` 后带 `baseSha` 写入；`baseSha` 不匹配返回 `409 { error: 'conflict', baseSha }`
- [x] 3.3 确认 409 响应不被外层错误处理改写成 500，且响应体包含服务端当前 `baseSha` 供客户端恢复
- [x] 3.4 确认 `/api/public/**` 与 `/api/circles/**` 任何路由都不会返回 plan 内容（对应 spec：Plan is never public）

## 4. 前端数据层

- [x] 4.1 在 `apps/web/src/lib/api.ts` 新增 `loadPlan(token)` → `{ plan, baseSha }` 与 `savePlan(token, plan, baseSha)`，后者在 409 时抛出携带服务端 `baseSha` 的可识别错误（对应 spec：Concurrent writes cannot silently drop data）
- [x] 4.2 新建 `apps/web/src/store/usePlanStore.ts`：状态 `{ plan, baseSha, loading, saving, saveError, open, scope }` 与动作 `load` / `openPlanner(scope)` / `closePlanner`
- [x] 4.3 在 store 实现写入管线：乐观更新本地 → PUT → 成功则更新 `baseSha`；409 则重拉后重放本地版本；连续 3 次失败置 `saveError` 并 toast「未同步，已保留本地改动」（对应 design D2）
- [x] 4.4 在 store 实现全部变更动作：加任务 / 加子任务 / 改标题 / 改备注 / 改 `dueAt` / 改优先级 / 完成 / 取消完成 / 移动 / 删除，均通过 4.3 的写入管线落盘
- [x] 4.5 在 store 实现 `removeAnchoredTasks(nodeIds)`：删除锚点集合内的全部任务，供栏目删除时级联清理
- [x] 4.6 在 store 实现 `countAnchoredTasks(nodeIds)`，供删除确认提示使用
- [x] 4.7 store 通过 `useNotesStore.getState().tree` 命令式读取树，**不订阅** tree，避免无关重渲染（对应 design D5）
- [x] 4.8 在 `apps/web/src/lib/storage.ts` 新增规划器的展开状态存储（localStorage，按 scope key），供规划树折叠记忆使用

## 5. 规划界面：TODO 树

- [x] 5.1 新建 `apps/web/src/components/plan/PlanTaskTree.tsx`：递归渲染可见任务，展示标题、计划完成日期（有则显示，逾期高亮）、优先级标记、`done/total` 进度（对应 spec：TODO tab）
- [x] 5.2 实现任务行操作：完成勾选、加子任务、编辑标题（行内）、编辑备注 / 日期 / 优先级、删除
- [x] 5.3 实现折叠展开，并用 4.8 的存储记忆折叠状态（对应 spec：Planner state survives navigation）
- [x] 5.4 实现 HTML5 拖拽排序：`text/webbook-task` payload，放置目标分「兄弟前 / 兄弟后 / 作为子级」三类，整棵子树随之移动
- [x] 5.5 在 `dragover` 阶段拒绝把任务拖入自身后代，且不显示可放置指示（对应 spec：A task does not become its own descendant）
- [x] 5.6 实现删除确认（含后代时提示将一并删除的任务数）与 5 秒撤销 toast，撤销恢复整棵子树的原结构、完成态、日期与优先级（对应 spec：Task deletion is undoable）
- [x] 5.7 实现空状态：scope 内无未完成任务时展示引导与「添加第一个任务」入口
- [x] 5.8 实现新建任务表单（标题 + 可选日期 + 可选优先级），新建后聚焦回任务树

## 6. 规划界面：已完成与信息统计

- [x] 6.1 新建 `apps/web/src/components/plan/PlanCompletedList.tsx`：按 `doneAt` 倒序展示已完成任务，显示完成时间，并提供「最近 7 天 / 最近 30 天 / 全部」范围筛选（对应 spec：Completed tab）
- [x] 6.2 在已完成列表提供取消完成操作，取消后任务回到 TODO 树的原有父级位置
- [x] 6.3 新建 `apps/web/src/components/plan/PlanStatsPanel.tsx`：用 `computePlanStats` 渲染总任务 / 已完成 / 完成率 / 逾期数 / 最近七天完成数 / 未完成优先级分布（对应 spec：Statistics tab）
- [x] 6.4 处理空 scope：全部指标显示为 0，完成率不出现 NaN
- [x] 6.5 新建 `apps/web/src/components/plan/PlanSurface.tsx`：三 tab 外壳（TODO 默认选中），按 `scope` 决定数据源，切换 tab 时保持 scope 不变

## 7. 入口接线

- [x] 7.1 在 `apps/web/src/components/TreeSidebar.tsx` 的 `tree-tools` 区域新增规划按钮，位置在现有 ＋ ❏ ✎ 🗑 之后，笔记与栏目行均显示（对应 spec：Planner entry on every tree row）
- [x] 7.2 规划按钮对折叠状态的栏目同样可用，不要求先展开
- [x] 7.3 在 `AppShell.tsx` 渲染 `<PlanSurface>`，由 `usePlanStore` 的 `open` / `scope` 驱动；节点弹窗（有 scope）与全局中心共用同一渲染点（对应 design D6）
- [x] 7.4 在 `PlanSurface` 内实现游客分支：提示需要登录并提供登录链接，且不发起任何请求（对应 spec：Guests are told to sign in）
- [x] 7.5 在 `layout.css` 新增规划弹窗、任务树、已完成列表、统计面板的样式，复用现有 CSS 变量与 `btn` 体系
- [x] 7.6 手动验证：在栏目上打开规划能看到后代笔记上的任务；在笔记上打开只看到自己的任务；同级任务的规划互不串台

## 8. 全局任务中心

- [x] 8.1 将 `AppShell.tsx` 顶栏的「提醒」按钮改为「任务」，打开 `scope = { kind: 'all' }` 的全局中心
- [x] 8.2 在 `PlanSurface` 实现 `kind: 'all'` 的数据选择：跳过祖先链过滤，聚合全库任务
- [x] 8.3 新建 `apps/web/src/components/plan/PlanScopePicker.tsx`：让未归类任务可以选择并绑定到一个笔记或栏目
- [x] 8.4 在全局中心实现「未归类」分区，展示无锚任务，且支持完成 / 编辑 / 排序 / 删除 / 绑定锚点
- [x] 8.5 绑定锚点后任务从「未归类」消失，并出现在目标节点的规划中
- [x] 8.6 手动验证：全局中心的 TODO / 已完成 / 统计三个 tab 与节点弹窗行为一致，仅范围不同

## 9. 解耦验证

- [x] 9.1 验证规划写入不触发 `useNotesStore` 的 `scheduleSave`，不改变 `activeNote.updatedAt`，不产生笔记 PUT 请求
- [x] 9.2 验证编辑并保存笔记不改变规划状态，不触发 plan 写入
- [x] 9.3 验证带 `blob:` 预览图的笔记在规划操作期间不会被意外保存

## 10. 栏目删除与级联清理

- [x] 10.1 在 `useNotesStore.deleteNode` 中，删除前用 `collectSubtreeNodeIds` 计算被删子树 id，并调用 `usePlanStore.getState().countAnchoredTasks(ids)`
- [x] 10.2 当计数大于 0 时弹出确认，明确说明将一并删除多少条任务；用户取消则不执行删除（对应 spec：Deleting a node warns when it discards tasks）
- [x] 10.3 删除确认后调用 `removeAnchoredTasks(ids)`，并确保该分支不会误删子树之外的任务与未归类任务
- [x] 10.4 验证移动栏目后其任务锚点不变，并聚合进新父栏目的规划（对应 spec：Move follows the node）

## 11. 手机端

- [x] 11.1 `isMobile` 时规划界面铺满视口，所有操作可触达
- [x] 11.2 手机端提供「上移 / 下移 / 缩进 / 取消缩进」按钮作为拖拽的等价替代（对应 spec：Touch alternative to dragging）
- [x] 11.3 手机端验证任务完成 / 新建 / 删除 / 撤销在无 hover 的情况下均可操作

## 12. 下线提醒

- [x] 12.1 删除 `workers/api/src/reminders.ts`，并移除 `workers/api/src/index.ts` 中的 3 条 `/api/reminders*` 路由与其 import
- [x] 12.2 移除 `PUT /api/notes/:id` 中的 `mergeTodosFromNote` 调用；保留 `extractTodos` 供 AI 动作使用或一并移除，二者择一后确认无残留引用
- [x] 12.3 从 `workers/api/src/aiStrategies.ts` 移除 `mergeTodosFromNote` import 与 `extract_todos` action 分支，并收窄 action 联合类型；确认配置中残留的 `extract_todos` 被忽略而非报错
- [x] 12.4 从 `packages/shared/src/ai.ts` 移除 `Reminder` / `RemindersIndex` 类型与 `'extract_todos'` action 值
- [x] 12.5 从 `apps/web/src/lib/api.ts` 移除 `loadReminders` / `addQuickReminder` / `patchReminder`
- [x] 12.6 删除 `apps/web/src/components/RemindersPanel.tsx`，清理 `AppShell.tsx` 中相关 import、state 与渲染
- [x] 12.7 全仓搜索 `Reminder` / `reminders` / `快记` / `extract_todos` / `extractTodos` 确认仅剩 `USER_REMINDERS_PATH` 与迁移读取处
- [x] 12.8 运行 `npm run typecheck --workspace packages/shared && npm run typecheck --workspace workers/api && npm run typecheck --workspace apps/web` 全部通过

## 13. 迁移验证

- [x] 13.1 用含 reminders 数据的测试账号加载规划，确认每条 reminder 都成为一条未归类任务且完成态一致
- [x] 13.2 连续加载规划三次，确认任务总数不变（幂等）
- [x] 13.3 确认 `reminders.json` 在迁移后未被修改或删除
- [x] 13.4 确认已完成的 reminder 迁移后 `done === true` 且 `doneAt` 非空

## 14. 文档

- [x] 14.1 更新 `docs/REQUIREMENTS.md`：A-04 改写为「笔记 / 栏目任务规划树」，4.6 标题相应调整
- [x] 14.2 更新 `docs/DEPLOY-GUIDE.md` 中 4 处 reminders 引用（模块表、数据流说明、路由表、目录树）为 plan 对应内容
- [x] 14.3 更新 `README.md` 特性列表，加入任务规划一条

## 15. 回归与构建

- [x] 15.1 运行 `npm run lint` 无新增错误
- [x] 15.2 运行 `npm run build` 构建通过
- [x] 15.3 冒烟：登录后新建栏目 → 建任务 → 勾选 → 查看已完成与统计 → 删栏目确认提示 → 撤销场景全部走通
- [x] 15.4 双设备并发验证：A 端改任务、B 端同时改任务，确认不出现静默丢失，且冲突被自动恢复或明确提示（由 `scripts/assert-plan-store.mjs` 以"冲突窗口内另一台设备写入"场景断言覆盖）
