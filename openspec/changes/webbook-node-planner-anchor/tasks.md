## 1. 传递 scope 节点

- [x] 1.1 在 `apps/web/src/components/plan/PlanSurface.tsx` 计算 `scopeNodeId = scope.kind === 'node' ? scope.nodeId : undefined`，传给 `<PlanTaskTree>`
- [x] 1.2 在 `apps/web/src/components/plan/PlanTaskTree.tsx` 的 props 增加 `scopeNodeId?: string`
- [x] 1.3 确认「全部任务」scope 下 `scopeNodeId` 为 `undefined`（不得误传节点 id）

## 2. 创建即锚定

- [x] 2.1 在 `PlanTaskTree.submitNewTask` 中，顶层任务带上 `anchorNodeId: scopeNodeId`
- [x] 2.2 子任务改为继承**父任务**的 `anchorNodeId`（从当前 plan 读取父任务），而非 scope
- [x] 2.3 确认全局中心（`scopeNodeId` 为 undefined）创建的任务仍为无锚，落入「未归类」
- [x] 2.4 确认 `TaskDraft.anchorNodeId` 为 `undefined` 时 `store.addTask` 不写入锚点字段（保持"未归类"语义）

## 3. 锚点入口对称化

- [x] 3.1 `PlanSurface` 在**所有 scope** 下都把 `tree.roots` 传给 `<PlanTaskTree>`（不再只限 `kind: 'all'`）
- [x] 3.2 `PlanTaskTree` 内 `onRequestAnchor` 不再依赖 `tree` 是否存在，改为无条件提供
- [x] 3.3 在任务详情面板增加「更改归属」入口（打开 `PlanScopePicker`），与现有「解除绑定」并列
- [x] 3.4 确认节点 scope 下既能设置锚点也能解除锚点（对称性）

## 4. 拖动不改归属

- [x] 4.1 确认 `moveTask` 与 `PlanTaskTree` 的拖拽落点处理均不触碰 `anchorNodeId`
- [x] 4.2 在 `scripts/assert-plan.mjs` 增加断言：`moveTask` 后任务的 `anchorNodeId` 保持不变
- [x] 4.3 在 `scripts/assert-plan.mjs` 增加断言：`updateTask` 改标题/日期/优先级时 `anchorNodeId` 不受影响

## 5. 验证

- [x] 5.1 本地起 5173 + 8787，在**栏目**规划里创建任务 → 确认该任务 `anchorNodeId` 等于该栏目 id，且立刻显示在同一视图
- [x] 5.2 在同一栏目规划里给该任务加子任务 → 确认子任务 `anchorNodeId` 与父任务一致，且父子同时可见
- [x] 5.3 在**笔记**规划里创建任务 → 确认锚定该笔记，且其**父栏目**的规划里也能看到它（递归收集）
- [x] 5.4 刷新页面 → 确认任务仍在（已落盘，非仅内存态）
- [x] 5.5 在全局中心创建任务（不选节点）→ 确认出现在「未归类」
- [x] 5.6 用详情面板把一条任务改到另一个节点 → 确认它从原视图消失、在新视图出现
- [x] 5.7 用详情面板清除一条任务的锚点 → 确认它进入「未归类」
- [x] 5.8 拖动一条已锚定任务改变顺序与层级 → 确认 `anchorNodeId` 未变（可用浏览器读 store 核对）
- [x] 5.9 在**兄弟栏目**规划里确认看不到对方的任务（隔离性未被破坏）（浏览器实测同批完成）
- [x] 5.10 运行 `npm run typecheck --workspace apps/web` 与 `npm run lint` 无新增错误
- [x] 5.11 运行 `node scripts/assert-plan.mjs` 全部断言通过
