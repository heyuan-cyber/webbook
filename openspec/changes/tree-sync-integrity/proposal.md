## Why

2026-09-26 03:10:26（commit `b2b04e85`）一次的目录树写入，让用户在一次提交内丢掉 23 个栏目、13 篇笔记引用——从一个 39 栏目/25 引用的树，变成 24 栏目/12 引用的树。数据本身没丢（笔记文件仍在磁盘），但树不再指向它们；事后只能靠 git 历史人工重建。

根因不是某个 bug，而是三层防御同时缺失：

1. `PUT /api/tree` 是无条件整树覆盖，不校验客户端读到的是哪个版本；
2. 客户端在云端加载失败时**静默**改用本地树，之后任意一次保存都把这棵本地树推回云端；
3. 游客登录时的草稿上传用整树覆盖（`LoginPage.tsx:39-42`），而非合并。

讽刺的是，处理这类问题所需的条件写原语（`putFileConditional` / `FileConflictError` / `getFileSha`）已经在本仓库存在——它是为 plan（任务规划）功能建的，并已接给 `PUT /api/plan`。**但 tree 路由仍是 last-write-wins**，也就是说吃掉用户栏目的那条路至今敞开。同一仓库里两种并发语义并存，本身就是隐患。

`/api/plan` 的冲突链路已验证可行（409 → 重拉 → 重放），因此本变更主要是把既有原语移植到目录树，而不是发明新机制。

## What Changes

- **目录树改为条件写（compare-and-swap）**：`GET /api/tree` 返回该文件的 `_rev`；`PUT /api/tree` 接受 `baseRev`，与当前 sha 不符时返回 `409 { error: 'conflict', baseRev }`，不再落盘。
- **客户端冲突处理**：收到 409 时**暂停目录树的自动保存**，提示用户选择「用云端覆盖本地 / 用本地覆盖云端（显式警告）」，不再静默覆盖。（**BREAKING**：`PUT /api/tree` 的请求体增加 `baseRev`；未带 `baseRev` 的旧客户端将被拒绝，因此 Worker 必须与前端同步部署。）
- **禁止"降级读 → 权威写"**：云端目录加载失败时不再静默返回本地树；进入显式的离线（本地）状态，并在该状态下**禁止远端树写入**。
- **登录合并改为并集**：游客草稿上传时，本地树与云端树按节点 id 做增量并集合并，而不是整树覆盖；本地为空时保持现有行为（不覆盖云端）。
- **目录树版本历史与回滚**：新增读取目录树历史与指定版本的能力，并在界面上提供"恢复某个版本"的入口，使此类事故可以自助恢复，而不必依赖 git 操作。
- **目录树体检**：新增脚本比对"树引用"与"磁盘笔记文件"，报告孤儿笔记（本次事故前数据仓已有 34 篇历史孤儿，长期无人发现）。

**非目标：**

- 不改笔记（`/api/notes/*`）的并发语义——笔记是单文档写入，本次只处理目录树。
- 不做服务端自动合并或 CRDT；冲突交给人决定。
- 不改动 circle 的目录树（`/api/circles/{id}/tree`）——同源问题，但影响面与鉴权路径不同，留待后续。
- 不清理历史孤儿笔记（34 篇）——体检脚本只报告，删除由用户决定。

## Capabilities

### New Capabilities

- `tree-sync-integrity`: 目录树的写入并发安全（条件写与冲突上报）、离线降级语义（降级读不得升格为权威写）、游客草稿登录时的并集合并、目录树的版本历史与回滚、以及孤儿笔记体检。

### Modified Capabilities

无。目录树的同步语义此前没有任何 spec 覆盖（现存 `web-ui-*` 能力描述的是展示与交互，`task-plan` 描述的是规划自身的并发），因此以新能力承载。

## Impact

**Worker（`workers/api`）**

- `src/index.ts`：`GET /api/tree` 附带 `_rev`；`PUT /api/tree` 改用 `putFileConditional` 并映射 `FileConflictError → 409`；新增目录树历史与版本读取路由。
- `src/userData.ts`：`saveUserTree` 接受 `expectedSha`；新增读取树 sha 与指定版本树的函数。
- `src/github.ts`：复用既有 `putFileConditional` / `getFileSha` / `fileHistory`，不新增写入原语。

**前端（`apps/web`）**

- `src/store/repository.ts`：加载失败不再静默回退；新增离线态与"禁止远端写"的判定。
- `src/lib/api.ts`：`loadTree` 读取 `_rev`，`saveTree` 传 `baseRev`，新增 409 冲突错误类型与历史/版本方法。
- `src/store/useNotesStore.ts`：持有 `treeRev`；冲突时暂停自动保存。
- `src/pages/LoginPage.tsx`：游客合并由整树覆盖改为并集合并。
- 新增冲突提示与版本恢复的界面。

**脚本（`scripts/`）**

- 新增目录树体检脚本；`package.json` 增加对应命令。

**部署**

- 需要 `wrangler deploy`（路由语义变更），且**必须与前端同步上线**：新前端依赖 `_rev`/409，旧 Worker 不返回 `_rev`。

**数据**

- 无 schema 变更、无迁移。已恢复的目录树（commit `b08fcc48`）不受影响。
