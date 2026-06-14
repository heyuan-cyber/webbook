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
export const USER_CIRCLES_INDEX_PATH = (userId: string) =>
  `data/meta/user-circles/${userId}.json`;

export const COMMENT_PATH = (ownerId: string, noteId: string) =>
  `data/comments/${ownerId}/${noteId}.json`;

export const USER_REMINDERS_PATH = (userId: string) =>
  `data/users/${userId}/reminders.json`;

export const AI_STRATEGIES_PATH = 'data/meta/ai-strategies.json';
export const SYSTEM_SETTINGS_PATH = 'data/meta/settings.json';
