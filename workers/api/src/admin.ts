import type { Env } from './env';
import { getFile, putFile } from './github';
import type { SystemSettings } from '@webbook/shared';
import { DEFAULT_SYSTEM_SETTINGS, SYSTEM_SETTINGS_PATH } from '@webbook/shared';
import type { AuthUser } from './auth';
import {
  loadUsersIndex,
  setUserDisabled,
  type UserIndexEntry,
} from './usersRegistry';
import { loadAiStrategies, saveAiStrategies } from './aiStrategies';
import type { AIStrategiesConfig } from '@webbook/shared';

export function requireAdmin(user: AuthUser | null): user is AuthUser {
  return Boolean(user && user.role === 'admin');
}

export async function loadSystemSettings(env: Env): Promise<SystemSettings> {
  const raw = await getFile(env, SYSTEM_SETTINGS_PATH);
  if (!raw) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      githubRepo: env.GITHUB_REPO ?? '',
      githubBranch: env.GITHUB_BRANCH ?? 'main',
      aiProvider: env.AI_PROVIDER ?? DEFAULT_SYSTEM_SETTINGS.aiProvider,
      aiBaseUrl: env.AI_BASE_URL ?? DEFAULT_SYSTEM_SETTINGS.aiBaseUrl,
      aiModel: env.AI_MODEL ?? DEFAULT_SYSTEM_SETTINGS.aiModel,
    };
  }
  const data = JSON.parse(raw) as SystemSettings;
  return { ...DEFAULT_SYSTEM_SETTINGS, ...data, schemaVersion: 1 };
}

export async function saveSystemSettings(env: Env, settings: SystemSettings): Promise<void> {
  await putFile(
    env,
    SYSTEM_SETTINGS_PATH,
    JSON.stringify({ ...settings, schemaVersion: 1 }, null, 2),
    'meta: system settings',
  );
}

export async function listAdminUsers(env: Env): Promise<UserIndexEntry[]> {
  const index = await loadUsersIndex(env);
  return [...index.users].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function updateAdminUser(
  env: Env,
  userId: string,
  disabled: boolean,
): Promise<UserIndexEntry | null> {
  return setUserDisabled(env, userId, disabled);
}

export async function getAdminAiStrategies(env: Env): Promise<AIStrategiesConfig> {
  return loadAiStrategies(env);
}

export async function putAdminAiStrategies(
  env: Env,
  config: AIStrategiesConfig,
): Promise<void> {
  await saveAiStrategies(env, config);
}
