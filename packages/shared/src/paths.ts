/** GitHub 仓内数据路径（与 Workers 保持一致） */
export const LEGACY_TREE_PATH = 'data/tree.json';
export const LEGACY_NOTE_PATH = (noteId: string) => `data/notes/${noteId}.json`;

export const USERS_INDEX_PATH = 'data/meta/users-index.json';
export const USER_TREE_PATH = (userId: string) => `data/users/${userId}/tree.json`;
export const USER_NOTE_PATH = (userId: string, noteId: string) =>
  `data/users/${userId}/notes/${noteId}.json`;
export const USER_ASSET_PATH = (userId: string, filename: string) =>
  `data/users/${userId}/assets/${filename}`;

export const CIRCLE_PATH = (circleId: string) => `data/meta/circles/${circleId}.json`;
export const CIRCLE_TREE_PATH = (circleId: string) => `data/circles/${circleId}/tree.json`;
export const CIRCLE_NOTE_PATH = (circleId: string, noteId: string) =>
  `data/circles/${circleId}/notes/${noteId}.json`;
export const USER_CIRCLES_INDEX_PATH = (userId: string) =>
  `data/meta/user-circles/${userId}.json`;

export const COMMENT_PATH = (ownerId: string, noteId: string) =>
  `data/comments/${ownerId}/${noteId}.json`;

export const USER_REMINDERS_PATH = (userId: string) =>
  `data/users/${userId}/reminders.json`;

/** 任务规划：整棵计划树单文件（旧 reminders 仅迁移时读取，不再写入） */
export const USER_PLAN_PATH = (userId: string) => `data/users/${userId}/plan.json`;

/**
 * 到点提醒（native-android-companion）。
 *
 * 刻意与 `USER_REMINDERS_PATH` 分开：那个文件归 `webbook-node-planner` 的规划迁移所有，
 * 其 `mergeReminders` 会把「有 id 且有 text」的条目永久并入 `plan.json`。
 * 若新版提醒共用一个文件，只要沾上 `text` 字段就会被静默吞成规划任务，且不可逆。
 * 详见 design.md 的 D8。
 */
export const USER_NOTIFY_PATH = (userId: string) => `data/users/${userId}/notify.json`;

/** 手机使用统计：一天一个分片，避免整文件读改写随天数线性恶化 */
export const USER_USAGE_DAY_PATH = (userId: string, date: string) =>
  `data/users/${userId}/usage/${date}.json`;

/** 消费记录：一个月一个分片（按月合并写入，避免逐笔产生 commit） */
export const USER_EXPENSES_MONTH_PATH = (userId: string, month: string) =>
  `data/users/${userId}/expenses/${month}.json`;

/** 消费分类规则：商户 → 类别。AI 只对每个新商户调用一次，之后走确定性规则 */
export const USER_EXPENSE_RULES_PATH = (userId: string) =>
  `data/users/${userId}/expenses/rules.json`;

/** 飞书 User OAuth（refresh 等），仅 Worker 读写 */
export const USER_FEISHU_OAUTH_PATH = (userId: string) =>
  `data/users/${userId}/feishu-oauth.json`;

export const PUBLIC_CIRCLES_INDEX_PATH = 'data/meta/public-circles-index.json';
export const AI_STRATEGIES_PATH = 'data/meta/ai-strategies.json';
export const SYSTEM_SETTINGS_PATH = 'data/meta/settings.json';
