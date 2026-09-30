## Why

`webbook-node-planner` 已交付并归档，但它的两处行为与自身已批准的 spec 不一致，导致**功能在真实使用中不可用**：

1. **在笔记/栏目规划里创建的任务不会锚定该节点**。spec 的 `Tasks anchor to notes and columns` 明确要求 *"A task created while the planner is opened for a specific note or column SHALL anchor to that node"*，实现没有传 `anchorNodeId`。实测：用户从侧边栏行创建 2 条任务，二者 `anchorNodeId` 均为空，于是在该栏目的规划里始终显示 0 条——而父栏目递归收集本身是正常工作的，只是无任务可收。
2. **节点 scope 下无法设置锚点，却能解除锚点**。锚点选择器仅在传入 `tree` prop（只有全局中心传）时渲染，而详情面板里的「解除与笔记/栏目的绑定」始终渲染。这个不对称使"在笔记里创建任务"成了一条死路：任务建出来即不可见，且在该视图内没有任何入口把它绑回来。

用户已确认期望的模型是：**在侧边栏创建的任务，就归类到这个笔记或栏目下面；父栏目递归收集其下所有子任务。** 这比当前实现更严格，也消解了"无锚任务"这个中间态——它从正常状态退化为历史数据清理入口。

## What Changes

- **创建即锚定**：从节点 scope 的规划创建任务时，强制锚定该节点。不提供"不归类"选项。
- **子任务继承锚点**：在节点 scope 内创建子任务时继承父任务的 `anchorNodeId`，避免 spec 的 `Anchor is independent of nesting` 场景下出现"父任务可见、子任务不可见"的断树。
- **全局中心 = 收件箱**：在全局任务中心不选节点创建的任务落进「未归类」筐。这是唯一仍会产生无锚任务的入口，且它本身就是可见、可绑定的。
- **锚点可修改与清除**：任务详情面板提供更改 / 清除锚点的入口，且在所有 scope 下都可用（消除"能解除不能设置"的不对称）。**这条要求此前未被 spec 覆盖**，本次补上。
- **拖动不改变归属**：任务在筐内的拖动只改变任务树的嵌套与顺序，不改变 `anchorNodeId`。此语义此前未明确，本次写进 spec。
- **规格变更**：新增能力 `task-anchor`，把"创建即锚定 / 收件箱 / 锚点可改 / 拖动不改归属"固化为可验证契约。

## Capabilities

### New Capabilities

- `task-anchor`: 任务归属契约——每个笔记/栏目是一个任务筐，在其中创建的任务锚定该筐；父栏目递归收集后代筐的任务；唯一无锚来源是全局中心的收件箱；锚点可在详情面板修改或清除；筐内拖动不改变归属。

### Modified Capabilities

无。`webbook-node-planner` 交付的 `task-plan` / `task-planner-ui` 已归档为正式 specs，其现有要求不需要改写——本次缺的是**新增**要求（锚点可改、拖动语义），以及两处实现对齐。因此以新能力承载更贴合，也避免改动已归档能力的语义。

## Impact

**修改**
- `apps/web/src/components/plan/PlanSurface.tsx`（把 `scope.nodeId` 传给任务树）
- `apps/web/src/components/plan/PlanTaskTree.tsx`（创建时带锚点、子任务继承、详情面板增加锚点编辑入口）

**不改**
- 数据模型：`PlanNode.anchorNodeId` 已是可选字段，无需迁移
- Worker / API：`PUT /api/plan` 与乐观锁链路不变
- `packages/shared/src/plan.ts`：`selectVisibleTasks` / `collectSubtreeNodeIds` 的聚合逻辑本就正确，无需改动

**数据**
- 既有 2 条无锚任务由用户自行在全局中心的「未归类」中绑定，本次不改动其数据
- 无 schema 版本变更，无迁移
