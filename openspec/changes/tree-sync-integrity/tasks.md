> 数据恢复已完成（tree.json 由 `48dce3c8` 增量并集合并，commit `b08fcc48`），不属于本变更的任务范围。

## 1. 共享并集合并原语

- [x] 1.1 新增 `packages/shared/src/treeMerge.ts`：实现 `mergeTreeById(target, source)` —— 按节点 id 做增量并集；target 中已存在的 id 只递归合并其 children，不改变 target 的顺序与已有节点；仅当递归结果发生变化时替换 children
- [x] 1.2 让 `mergeTreeById` 返回合并统计（新增根节点数、新增节点总数），供登录合并时向用户展示
- [x] 1.3 在 `packages/shared/src/index.ts` 导出 `treeMerge`
- [x] 1.4 新增 `scripts/assert-tree-merge.mjs`：断言两棵不相交的树合并后包含双方全部节点
- [x] 1.5 在 `scripts/assert-tree-merge.mjs` 断言：两棵树共有的 id 合并后只保留一个节点，且保留 target 的布局
- [x] 1.6 在 `scripts/assert-tree-merge.mjs` 断言：source 为空树时 target 不被改动（深比较相等）
- [x] 1.7 在 `scripts/assert-tree-merge.mjs` 断言：合并结果无重复 id；且 target 原有节点的相对顺序不变

## 2. Worker：目录树修订与条件写

- [x] 2.1 在 `workers/api/src/userData.ts` 新增 `loadUserTreeWithRev(env, userId)`，返回 `{ tree, rev }`，`rev` 取 `getFileSha`（无文件时为 `null`）
- [x] 2.2 在 `workers/api/src/userData.ts` 新增 `saveUserTreeConditional(env, userId, email, tree, baseRev)`，内部使用既有的 `putFileConditional`（**不得**退回 `putFile`）
- [x] 2.3 保留 `saveUserTree` 原签名供内部调用方（legacy 迁移等）使用，并在其 JSDoc 注明「无条件写，仅限服务端内部调用，不得用于客户端请求路径」
- [x] 2.4 `workers/api/src/index.ts` 的 `GET /api/tree` 改为返回 `{ ...tree, _rev }`
- [x] 2.5 `workers/api/src/index.ts` 的 `PUT /api/tree` 要求请求体含 `baseRev`；缺失时返回 400（`error: 'missing_baseRev'`），且不写盘
- [x] 2.6 `PUT /api/tree` 捕获 `FileConflictError` 并返回 `409 { error: 'conflict', baseRev: <当前sha> }`；只认 `FileConflictError`，网络/权限错误不得报成 409
- [x] 2.7 确认 `GET /api/tree` 内的 legacy 自动迁移仍走 `saveUserTree`（一次性引导写），不因 2.5 而失效
- [x] 2.7b 把笔记保存路径上的**可见性同步**也改为条件写：`loadUserTreeWithRev` + `saveUserTreeConditional`，冲突重读重试一次；失败不阻断笔记保存（best-effort）
  - 后续在 10.2 中整体移除：服务端代写整树正是"客户端 revision 悄悄过期"的来源
- [x] 2.8 新增 `GET /api/tree/history`（需登录，owner-only）：复用 `fileHistory`，返回 `{ versions: [{ sha, date, message }] }`，按时间倒序并限制条数
- [x] 2.9 新增 `GET /api/tree/versions/:sha`（需登录，owner-only）：返回该版本的目录树；sha 非法或不存在时返回 404

## 3. 前端：修订跟踪与冲突提示

- [x] 3.1 `apps/web/src/lib/api.ts`：`loadTree` 返回 `{ tree, rev }`（从响应的 `_rev` 读取）；`rev` 缺失时视为服务端未更新
- [x] 3.2 `apps/web/src/lib/api.ts`：`saveTree(tree, baseRev, token)` 在请求体带 `baseRev`；新增 `TreeConflictError`（携带 409 与当前 `baseRev`）
- [x] 3.3 `apps/web/src/lib/api.ts`：新增 `treeHistory(token)` 与 `treeVersion(sha, token)`
- [x] 3.4 `apps/web/src/store/useNotesStore.ts`：持有 `treeRev`，`init` 时写入；每次树写入成功后更新
- [x] 3.5 `apps/web/src/store/repository.ts`：`saveTree` 接受并透传 `baseRev`，把 `TreeConflictError` 原样上抛（不得吞掉）
- [x] 3.6 `useNotesStore` 的防抖保存：收到 `TreeConflictError` 时**暂停**后续树写入（置 `treeConflict` 状态），并保留本地树不清空
- [x] 3.7 新增冲突提示界面：显示「云端目录已被其他设备修改」，提供「保留云端版本」与「用本地覆盖云端（危险）」两个选项
- [x] 3.8 选择「保留云端」后采用云端 `baseRev`、丢弃本地树改动并提示；选择「覆盖云端」后以服务端返回的最新 `baseRev` 重发一次写入
- [x] 3.9 冲突未解决期间继续编辑不得丢内容（本地树与 IndexedDB 均保留）

## 4. 前端：离线（local-only）态

- [x] 4.1 `apps/web/src/store/repository.ts`：`loadTree` 云端失败时仍返回本地树，但把实例标记为 `localOnly`（新增字段），并在成功加载后清除
- [x] 4.2 `repository.saveTree`：`localOnly` 为真时只写 IndexedDB，不发起远端写
- [x] 4.3 `apiClient.loadTree` 返回的 `rev` 缺失时（服务端未更新）同样进入 `localOnly`，避免以无修订的方式写入
- [x] 4.4 顶栏或状态区显示「本地模式（未同步）」提示，并在重新加载成功后消失

## 5. 前端：登录并集合并

- [x] 5.1 `apps/web/src/pages/LoginPage.tsx`：上传本地草稿前先 `loadTree` 取云端树与 `baseRev`
- [x] 5.2 用 `mergeTreeById(cloudTree, localTree)` 计算合并结果，向用户展示「新增 N 个栏目/笔记」后再提交
- [x] 5.3 合并结果以 `saveTree(merged, baseRev, token)` 条件写入；收到 409 时不覆盖，提示用户重试
- [x] 5.4 本地树为空时保持现有行为：不写云端
- [x] 5.5 保留既有的逐篇上传本地笔记文件的行为不变

## 6. 前端：目录树版本历史与恢复

- [x] 6.1 新增目录树历史入口（置于目录侧栏或笔记编辑器的工具区），仅站点所有者可见
- [x] 6.2 版本列表界面：显示时间与标签，最新在前
- [x] 6.3 选择某版本后展示其目录结构预览（只读）
- [x] 6.4 「恢复此版本」以条件写提交该版本内容（带当前 `baseRev`）；恢复后刷新目录并提示
- [x] 6.5 恢复过程中若发生 409，按 3.7 的冲突流程处理，不静默覆盖

## 7. 目录树体检脚本

- [x] 7.1 新增 `scripts/audit-tree.mjs`：列出「磁盘存在但树未引用」的孤儿笔记
- [x] 7.2 在 `scripts/audit-tree.mjs` 列出「树引用了但文件不存在」的悬空引用
- [x] 7.3 在 `scripts/audit-tree.mjs` 列出重复的节点 id
- [x] 7.4 确认脚本只读（仅 GitHub GET），并在输出中给出计数摘要
- [x] 7.5 在根 `package.json` 增加 `audit:tree` 命令

## 8. 验证

- [x] 8.1 `npm run typecheck -w apps/web` 与 `npm run typecheck -w workers/api` 均无错误
- [x] 8.2 `node scripts/assert-tree-merge.mjs` 全部断言通过
- [ ] 8.3 本地起 5173 + 8787：用两个客户端加载同一目录树，各自改名后保存 → 第二个保存收到 409 并弹出冲突提示，云端树未被覆盖
- [ ] 8.4 断开 Worker（停掉 `dev:api`）后改动目录树 → 不产生远端写，界面显示本地模式；恢复 Worker 并重新加载后提示消失且可正常保存
- [ ] 8.5 在历史面板中恢复一个旧版本 → 目录变为该版本内容，且再次恢复更早版本仍然可行（说明修订被正确更新）
- [x] 8.6 `node scripts/audit-tree.mjs` 能在当前数据仓上跑出结果（预期报告当前 34 篇历史孤儿）
- [x] 8.7 `openspec validate --changes tree-sync-integrity --strict` 通过

## 9. 部署（按 design.md D8：先前端，后 Worker）

- [x] 9.1 确认部署顺序为「前端 fail-closed → `wrangler deploy` Worker → 重新加载」，并在 `docs/DEPLOY-GUIDE.md` 记录该顺序与原因
- [x] 9.2 在 `docs/DEPLOY-GUIDE.md` 的 API 一览中补上 `_rev`/`baseRev`/409 语义与新增的两个历史路由

## 10. 后续修复：消灭"假冲突"（2026-11-13）

条件写落地后，生产环境仍频繁弹「云端目录已被其他设备修改」。根因不在 CAS，而在客户端与服务端
让 revision 以宿主不知情的方式移动。本节记录这次修复。

- [x] 10.1 前端目录写串行化 + 合并排队（`repository.saveTree`）：同一时刻只有一个 PUT 在飞，排队期间只保留最新一份树；冲突待决时只写本地、不发远端
- [x] 10.2 移除 `PUT /api/notes/:id` 的整树可见性同步：该写入会在客户端不知情时推进 revision，使单设备也误报冲突；可见性改由客户端随目录写提交（`setActiveVisibility` 标记树 dirty）
- [x] 10.3 管理后台改可见性 / 删笔记改为条件写（冲突重读重做，内容不变则不写）
- [x] 10.4 冲突流程修正：冲突期间继续编辑仍写 IndexedDB 并把"要保留的本地树"推进到最新；覆盖时提交最新树；保留云端时把云端树写回本机副本
- [x] 10.5 登录合并改为「先读云端 → 按 id 并集 → 条件写 → 刷新仓库 revision」，不再用 `baseRev: null` 整树覆盖
- [x] 10.6 新增 `scripts/assert-tree-queue.mjs`（`npm run assert:tree-queue`）：断言串行化、合并、冲突一并结束、待决期只写本地、覆盖后恢复可写、等待队尾
- [ ] 10.7 真机验证：单标签页连续新建 5 篇笔记不弹冲突；切换公开后改名不弹冲突；两个标签页各自改名仍能正确提示
