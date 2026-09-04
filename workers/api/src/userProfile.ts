import type { Env } from './env';
import { getFile, putFile } from './github';

export const profilePath = (userId: string): string =>
  `data/users/${userId}/profile.json`;

/** 个人主页各区域的内容配置（按笔记 id 指派，纯前端消费） */
export interface SiteConfig {
  /** 项目示例区：笔记 id（有序） */
  workNoteIds?: string[];
  /** 博客区：笔记 id（有序） */
  blogNoteIds?: string[];
  /** 博客分组的类别顺序（未设置时默认按笔记 category） */
  blogCategoryOrder?: string[];
}

export interface UserProfile {
  schemaVersion: 1;
  /** 用户指定的焦点作品（笔记 id） */
  featuredNoteId?: string;
  /** 个人主页站点配置 */
  site?: SiteConfig;
}

export async function loadUserProfile(env: Env, userId: string): Promise<UserProfile> {
  const raw = await getFile(env, profilePath(userId));
  if (!raw) return { schemaVersion: 1 };
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return { schemaVersion: 1, ...parsed };
  } catch {
    return { schemaVersion: 1 };
  }
}

export async function saveUserProfile(
  env: Env,
  userId: string,
  profile: UserProfile,
): Promise<void> {
  await putFile(env, profilePath(userId), JSON.stringify(profile), 'update profile');
}
