## Context

见 `proposal.md` — Why。设计只需要两个现实前提：

**1. 持久化只有 GitHub Contents API，没有数据库、没有事务、没有行级并发控制。** `workers/api/src/github.ts` 的 `putContentOnce()` 每次写入都"先读 sha 再 PUT"，`putContentWithRetry()` 把 409/422 当作网络抖动重试 3 次。也就是说现有写入语义是 **last-write-wins**，而且冲突被主动掩盖。这对 `notes/{id}.json` 是可接受的（单篇、体量小、用户不会同时编辑两处），对"一整棵任务树放一个文件"是不可接受的。

**2. 结构中枢是 `TreeNode` 树（folder / note 同构嵌套），前端 store 里已有完整一份。** `useNotesStore` 持有 `tree: NoteTree`，`findNode` / 子树遍历都是现成的纯函数。这意味着"父栏目自动收集子栏目数据"在前端几乎是免费的——不需要在 Worker 侧维护任何树的知识。

另外两个既有事实影响取舍：游客分支完全不联网（`makeRepository(null)` 只走 IndexedDB），而 `reminders` 是登录限定；`useNotesStore` 的保存路径带 800ms 防抖 + `blob:` 预览延后逻辑，为笔记正文设计，不适合承载规划写入。

## Goals / Non-Goals

**Goals:**

- 让"这个栏目/笔记接下来要做哪些事、做到哪一步"成为一等公民，且**结构由笔记树本身承载**，用户不需要手动维护两套层级。
- 在单文件 + 无事务的存储上做到**不静默丢数据**，并把冲突对用户隐藏。
- 规划写入与笔记正文写入**完全解耦**，互不触发、互不阻塞。
- 一个组件覆盖两种范围（节点 / 全库），避免两套并行实现走形。
- 安全下线提醒：既有数据可迁移、可回滚，引用点全部收敛。

**Non-Goals:**

- 不做多人协作任务（指派、@提醒、通知）。WebBook 的任务是单用户私有的，与 `visibility` 三档无关。
- 不做与飞书 / 外部任务系统的双向同步（`feishu` 模块的导出链路本次不动）。
- 不做任务级别的实时协同或 CRDT。冲突策略是"重放"而非"合并字段"。
- 不做子任务完成自动回卷父任务（已确认为"只算进度"），因此不需要实现状态推导机。
- 不做公网可见的任务 / 分享链接。
- 不改 `github.ts` 的既有重试语义（其它调用方继续享受重试）；只新增一条"显式冲突"的写入路径。

## Decisions

### D1. 整棵树放一个 `plan.json`（否决 per-node 分片）

`data/users/{userId}/plan.json` 存 `PlanDoc = { schemaVersion, nodes: PlanNode[], migratedReminders?: boolean }`。

```
data/users/{uid}/
  ├── tree.json              ← 唯一结构中枢
  ├── notes/{id}.json
  ├── reminders.json         ← 迁移后只读，不再写入
  └── plan.json              ← 新增：整棵任务树（nodes 为森林，可多根）
```

**理由**：父栏目要聚合到最深后代，前端必须能一次性拿到整份数据。分片方案下，打开一个 5 层栏目需要按后代数量发起 N 次 Contents API 请求（每次都是一次 GitHub 读 + base64 解码），延迟随层级线性增长且不可预测。

**已考虑并否决的替代方案**：

| 方案 | 否决理由 |
|---|---|
| `plans/{nodeId}.json` 每节点一文件 | 与 note 同构、爆炸半径小，但聚合需要 N 次请求；删除 / 移动节点的孤儿清理要跨文件协调，反而比单文件更复杂 |
| 结构 + 状态双文件 | 两份数据需要自行保证一致，复杂度与 bug 面最大 |
| 把任务塞进 `Note.blocks` 作为新块类型 | 栏目（folder）没有 Note 实体，无处安放；且会让笔记正文每次保存都携带全部任务，与解耦目标相反 |

**代价与触发阈值**：单文件写入体积 = 整棵树。按每节点约 150–250 字节估算，1 万条任务约 2MB——仍在 40MB 软上限内，但每次勾选一个任务都要提交一份 2MB diff。**若实测 plan.json 超过约 1MB 或节点数超过约 3000**，分片改造是后续独立变更（届时可按栏目子树分片 + 顶层索引），本设计不预留半成品机制。

### D2. 乐观锁：`baseSha` + 显式 409，且冲突路径禁用重试

```
GET /api/plan   →  { plan: PlanDoc, baseSha: string | null }

PUT /api/plan   body { plan: PlanDoc, baseSha: string | null }
    │
    ├─ current = getSha(env, USER_PLAN_PATH(uid))
    ├─ baseSha === undefined → 客户端没带 base → 视为强制覆盖（仅迁移/修复场景）
    ├─ baseSha !== current   → 409 { error: 'conflict', baseSha: current }   ← 绝不重试
    └─ 相等                   → 写入，返回 { ok: true, baseSha: 新值 }
```

新增 `putFileConditional(env, path, content, message, expectedSha)`，**不复用** `putContentWithRetry`：重试循环的存在意义是掩盖瞬时冲突，而这里冲突恰恰是必须暴露的信号。`github.ts` 既有函数保持不变。

**客户端冲突恢复**（重拉 + 重放**意图**，不是重放本地整份文档）：

```
用户勾选任务
   │ 立即本地更新 UI（乐观）
   ▼
PUT(plan, baseSha=上次读到的)
   ├─ 200 → 更新 baseSha，结束
   └─ 409 → GET 最新 plan + 新 baseSha
              → 在该 plan 之上重放【本次变更意图】（例：把任务 X 标记完成）
              → PUT；仍冲突则最多重试 3 次
              → 仍失败 → toast「未同步，已保留本地改动」+ saveError 标记
```

**关键：重放的必须是一次"变更意图"（`PlanDoc => PlanDoc`），而不是本地整份文档。**
把本地整份文档写回去会覆盖冲突窗口内另一台设备刚写入的内容——那仍然是静默丢数据，
只是把丢失时机从"无锁覆盖"推迟到了"冲突恢复时覆盖"。因此 store 的所有变更动作都以
`commit(set, mutation)` 形式提交意图，冲突时先拉服务端最新版，再把意图应用在它之上。

**替代方案**：服务端 patch 语义（客户端提交操作列表而非整棵树）能在理论上做更细的合并，
但需要引入一套操作日志与归约器，与"单文件简单模型"的整个取舍冲突，且 Worker 要理解树语义。否决。

### D3. 任务锚到树节点（`anchorNodeId`），父级聚合在前端

```
PlanNode.anchorNodeId?: string   ← TreeNode.id；缺失 = 未归类

打开节点 N 的规划：
  visibleAnchors = { N.id } ∪ descendants(N).map(n => n.id)      ← 纯树遍历
  visibleTasks   = plan.nodes 中所有满足以下之一的任务：
                     · node.anchorNodeId ∈ visibleAnchors
                     · 祖先链上存在 anchorNodeId ∈ visibleAnchors
  TODO 视图      = 这些任务构成的子树，按 PlanNode.children 顺序渲染
```

**关键取舍：规划层级由 `PlanNode.children` 承载，不由笔记树承载。** 一个栏目下的任务可以是任意深度嵌套，这个嵌套是用户自己的组织方式，跟"锚在哪个笔记"正交——同一个笔记上可以锚多条互不嵌套的任务。因此不引入 `planChildOf` 之类的树镜像结构。

**替代方案**（否决）：在 `plan.json` 里复制一份笔记树镜像。那会产生第二个结构真相，用户移动一个栏目就要同步两处，是必然的一致性 bug 源。

**代价**：`visibleTasks` 每次打开弹窗由前端 O(任务数) 计算，并需要一份 `Set<string>` 形式的祖先 id 集合。任务与笔记都在几千量级内，无需缓存；若将来需要，按 `(planRevision, scopeNodeId)` 记忆化即可。

**未归类任务的存放位置**：`plan.json` 的 `nodes` 是**森林**（多根数组），未归类任务天然是其中的无锚根节点。不需要额外的顶层桶，`nodes.filter(n => !n.anchorNodeId)` 且祖先链无锚即为未归类。全局任务中心把这类单独成区。

### D4. `dueAt` 用日期字符串，`doneAt` / `createdAt` 用完整 ISO 时间戳

`dueAt: 'YYYY-MM-DD'`（"计划完成日期"）。**不存 UTC 时刻**——否则 UTC+8 用户在晚上 8 点后设置的"今天"会存成前一天，第二天显示就错一天。`doneAt` / `createdAt` 是真实事件时刻，存完整 ISO。

逾期判定 = `dueAt < 本地今天的 YYYY-MM-DD`（字符串比较，无时区参与）。统计中的"最近七天"= 当前时刻往前 7×24 小时，与 `doneAt` 的 ISO 时刻比较。

这两种时间语义混用是刻意的，必须在实现时保持一致：**凡是"哪一天"的问题用日期串，凡是"什么时候发生的"用时间戳。**

### D5. 规划用独立 zustand store，不复用 `useNotesStore`

新增 `apps/web/src/store/usePlanStore.ts`，持有 `{ plan, baseSha, loading, saving, saveError, scopeNodeId, open }` 与全部变更动作。

**理由**：
- `useNotesStore` 的 `scheduleSave` 带 800ms 防抖与 `blob:` 预览延后逻辑，是为笔记正文的连续键入设计的；规划写入是离散动作（勾选、改名、拖拽落点），防抖只会扩大冲突窗口。
- 若挂在 `useNotesStore` 上，`treeDirty` / `activeNote` 的耦合会让"改任务导致笔记被标记保存"成为可能，直接违反 spec 的"规划与笔记编辑解耦"。
- 副作用：两个 store 都需要 `tree`。`usePlanStore` 通过 `useNotesStore.getState().tree` 读取（zustand 支持命令式读取），**不订阅**，避免无关重渲染。

**跨 store 唯一耦合点**：删除栏目 / 笔记后的级联清理。`useNotesStore.deleteNode` 在删除前计算被删子树的全部 id，调用 `usePlanStore.getState().removeAnchoredTasks(ids)`，并在有任务将被丢弃时先弹确认。这是一处显式的、单向的调用，不做事件总线。

### D6. 规划界面是一个组件，两种范围

```
apps/web/src/components/plan/
  ├── PlanSurface.tsx      三 tab 外壳：scope 由 props 决定
  ├── PlanTaskTree.tsx     TODO：嵌套渲染 + 拖拽 + 行内编辑
  ├── PlanCompletedList.tsx
  ├── PlanStatsPanel.tsx
  └── PlanScopePicker.tsx  未归类任务的锚点选择器

用法：
  节点弹窗   <PlanSurface scope={{ kind: 'node', nodeId }} />
  全局中心   <PlanSurface scope={{ kind: 'all' }} />
```

两种范围的差异**只在数据选择阶段**：`kind: 'node'` 跑 D3 的祖先集合过滤，`kind: 'all'` 跳过过滤并对无锚任务额外分区。渲染、拖拽、编辑、统计全部共用。

**入口形态**：不使用路由。`usePlanStore.open(scope)` 由侧边栏按钮和顶栏按钮共同调用，`AppShell` 渲染一次 `<PlanSurface>`。理由：规划是"随手打开看一眼"的轻量动作，路由化会带来返回栈与深链维护成本，而当前没有深链需求。

**拖拽**：复用侧边栏已有的 HTML5 DnD 模式（`text/webbook-node` 那套），新增 `text/webbook-task` payload。放置目标分三类：兄弟前 / 兄弟后 / 作为子级。拖到自身后代时在 `dragover` 阶段即拒绝（不显示可放置指示），避免无效落点。

**手机端**：`isMobile` 时全屏铺满，并提供"上移 / 下移 / 缩进 / 取消缩进"按钮作为拖拽的等价替代（`useMediaQuery` 已存在）。

### D7. 统计口径固定，父子都计入且只计一次

对 scope 内的全部任务（含嵌套后代）逐条判定，每条任务在每个指标中最多贡献 1：

| 指标 | 口径 |
|---|---|
| 总任务 / 已完成 / 完成率 | 全部任务；完成率 = 已完成 / 总任务，总数为 0 时报 0% 而非 NaN |
| 逾期 | `!done && dueAt && dueAt < 今天`；无 `dueAt` 的任务**不计入逾期**也不计入其分母 |
| 最近七天完成 | `done && doneAt >= now - 7d` |
| 优先级分布 | 仅 `!done` 的任务，按 `p0/p1/p2/none` 四档计数 |

"父子都计入"是明确选择：统计回答的是"这个栏目下有多少件事"，父任务本身就是一件事。不因它同时拥有子任务而排除，也不把它折算成子任务之和。

### D8. 提醒下线与迁移

**迁移**（在 `GET /api/plan` 内联，首次触发）：

```
读 plan.json → 若 plan.migratedReminders 已为 true → 直接返回
             → 否则读 reminders.json（可能不存在）
               → 对每条 reminder：
                    plan 中已存在同 id 的节点 → 跳过
                    否则 push 一个无锚根节点 { id: r.id, title: r.text,
                                              done: r.done, createdAt: r.createdAt,
                                              doneAt: r.done ? r.createdAt : undefined,
                                              priority: 'none', children: [] }
               → plan.migratedReminders = true → 写回
```

**幂等性来自两处**：`migratedReminders` 标记 + 按 `id` 去重。两者都不依赖 reminders 文件是否被删除。

**reminders.json 保留不删**——迁移后可读但不再写入，保留回滚余地。回滚策略见 Migration Plan。

**下线清单**（缺一即编译失败或功能残留）：

| 位置 | 动作 |
|---|---|
| `workers/api/src/reminders.ts` | 删除整个文件 |
| `workers/api/src/index.ts` | 删 3 条 `/api/reminders*` 路由；删 `mergeTodosFromNote` 调用（`PUT /api/notes/:id` 内） |
| `workers/api/src/aiStrategies.ts` | 删 `mergeTodosFromNote` import 与 `extract_todos` action 分支（**定时任务里的隐藏引用**） |
| `packages/shared/src/ai.ts` | 删 `Reminder` / `RemindersIndex` 类型；`'extract_todos'` 从 action 联合类型移除 |
| `apps/web/src/components/RemindersPanel.tsx` | 删除整个文件 |
| `apps/web/src/components/AppShell.tsx` | 删 import / state / 面板渲染；顶栏「提醒」按钮改为「任务」并打开全局中心 |
| `apps/web/src/lib/api.ts` | 删 `loadReminders` / `addQuickReminder` / `patchReminder` |
| `packages/shared/src/paths.ts` | 保留 `USER_REMINDERS_PATH`（迁移仍需读） |
| `workers/api/src/ai.ts` | `extractTodos` 保留（若其它 AI 动作仍用）；否则一并移除 `extract_todos` action |
| `docs/REQUIREMENTS.md` | A-04 改写为任务规划；4.6 标题调整 |
| `docs/DEPLOY-GUIDE.md` | 3 处 reminders 引用替换为 plan（模块表、数据流说明、路由表、目录树） |

**页面导航到被删笔记的链接**：`RemindersPanel` 里有 `to={/app/note/${r.noteId}}` 的入口，随组件删除自然消失；迁移后的任务若锚点为空则不提供笔记跳转。

### D9. 游客路径：明确拒绝，不静默降级

侧边栏规划按钮对游客可见但点击后展示"登录后可用规划"并给登录链接，**不发任何请求**。理由：规划是"跨设备持续维护的一棵树"，游客的 IndexedDB 数据不进 git、与登录后的数据无法合并，做本地版会让用户以为规划丢了。这与 `reminders` 的既有行为一致。

## Risks / Trade-offs

- **单文件无限增长** → 已定义阈值（约 1MB / 3000 节点）。触发时开独立分片变更，不在本变更内预留机制。缓解：`plan.json` 是独立文件，分片只影响 plan 相关的 3 个文件，不会外溢到笔记链路。
- **冲突重放可能覆盖并发意图** → 乐观锁把静默覆盖变成 409，但重放本身仍是"整份本地版本胜出"。缓解：连续 3 次冲突后停止并显式提示；明确记录这是"单写者假设"下的正确性，不是通用并发方案。
- **删除栏目级联丢任务**（已确认的行为）→ 缓解：删除前计算并显示将被丢弃的任务数；这是 spec 中的强制要求，不是可选提示。这是本变更里唯一不可撤销的数据丢失路径，实现时不得省略确认。
- **`dueAt` 与时区** → 缓解：用日期串而非时刻（D4）；代价是无法表达"某天下午 3 点前完成"，本变更确认不需要。
- **两个 store 之间的隐式耦合**（D5）→ 缓解：只保留一处单向调用（`deleteNode` → `removeAnchoredTasks`），并要求该调用在删除确认之前完成数量计算。若将来出现第二处，应改为显式的组合动作而非继续加调用点。
- **迁移写坏老数据** → 缓解：迁移只做追加（push 无锚根节点）与一个布尔标记，不修改既有节点；按 id 去重保证重复执行无害。
- **删除 `extract_todos` 定时动作后 cron 空转** → 缓解：`aiStrategies.ts` 的 action 联合类型同步收窄，配置里残留的 `extract_todos` 被忽略而不是报错（保持向后兼容的读）。

## Migration Plan

**部署顺序（必须按此序，避免新前端打旧 Worker）**：

1. Worker 先上：`GET/PUT /api/plan` 可用，`/api/reminders*` **暂时保留**。
2. 前端后上：规划入口与界面启用，顶栏改「任务」。
3. 观察一轮（确认迁移正确、无 409 异常升高）。
4. 收尾变更：删除 `/api/reminders*` 路由、`reminders.ts`、`RemindersPanel.tsx` 与所有引用点。

> 注：本变更的 specs 与 tasks 按"一次性完成"编写（已确认走"一步到位"），上述 1–2 步是**同一次部署内的代码顺序**（Worker 与前端分别发布），第 4 步的删除与 1–2 步在同一变更内交付，只是发布时序上 Worker 先行可以让旧前端在过渡窗口内不报 404。

**数据回滚**：

- `plan.json` 是新增文件，删除它即回到"无规划"状态，笔记与目录不受影响。
- `reminders.json` 全程不被修改或删除，因此重置 plan 后重新触发迁移即可回到提醒数据。
- 若需彻底回退：重新部署上一版 Worker（含 reminders 路由）+ 上一版前端；`plan.json` 残留不影响旧版本运行。

**迁移验证**：

- 迁移前后 reminders 条数 == plan 中带对应 id 的节点数。
- 重复 `GET /api/plan` 三次，节点总数不变（幂等）。
- 已完成 reminder → 迁移后 `done === true` 且 `doneAt` 非空。

## Open Questions

- **plan.json 的分片改造触发点**已在 D1 给出估算阈值，但真实体量依赖使用习惯；这是可延后的实现决策，不影响本变更的 spec 或任务拆分。
- **规划是否应扩展到圈子（circle）共同规划**：当前明确 Non-Goal。若将来要做，`USER_PLAN_PATH` 需要一套 `CIRCLE_PLAN_PATH` 对应物，`visibility` 与权限模型要重新讨论——属于新能力，不预留接口。
- **AI 能否直接生成 / 拆解任务**（"帮我把这篇笔记拆成任务"）：`extract_todos` 下线后这条链路暂时没有替代。本变更不实现；若要做，应作为独立的 AI 动作 + 用户确认 UI，而不是复用已下线的自动抽取。
