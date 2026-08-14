import type { Env } from './env';
import type { AuthUser } from './auth';
import { getBinaryFile } from './github';
import { listKnownUserIds } from './usersRegistry';
import {
  DEFAULT_VOLUME_ID,
  findVolume,
  loadVolumeRegistry,
  userAssetPath,
  type VolumeRegistry,
} from './volumes';

async function tryUserAsset(
  env: Env,
  repo: string,
  userId: string,
  name: string,
): Promise<Uint8Array | null> {
  return getBinaryFile(env, userAssetPath(userId, name), repo);
}

async function resolveInRepo(
  env: Env,
  repo: string,
  name: string,
  user: AuthUser | null,
): Promise<Uint8Array | null> {
  if (user) {
    const own = await tryUserAsset(env, repo, user.id, name);
    if (own) return own;
  }
  const legacy = await getBinaryFile(env, `data/assets/${name}`, repo);
  if (legacy) return legacy;
  for (const uid of await listKnownUserIds(env)) {
    if (user?.id === uid) continue;
    const bytes = await tryUserAsset(env, repo, uid, name);
    if (bytes) return bytes;
  }
  return null;
}

/**
 * Resolve uploaded asset bytes.
 * - volumeId 指定时只查该卷对应 repo
 * - 未指定（旧 URL）时先查默认卷 / meta，再扫其它卷
 * `<img>` 请求可能无 JWT，故跨 user 按文件名回退查找
 */
export async function resolveAssetBytes(
  env: Env,
  name: string,
  user: AuthUser | null,
  volumeId?: string | null,
): Promise<Uint8Array | null> {
  const registry = await loadVolumeRegistry(env);

  if (volumeId) {
    const vol = findVolume(registry, volumeId);
    if (!vol) return null;
    return resolveInRepo(env, vol.repo, name, user);
  }

  // Legacy /api/assets/:name — prefer default volume then others
  const ordered = orderVolumesForLegacyLookup(registry);
  for (const vol of ordered) {
    const hit = await resolveInRepo(env, vol.repo, name, user);
    if (hit) return hit;
  }
  return null;
}

function orderVolumesForLegacyLookup(registry: VolumeRegistry) {
  const pref = findVolume(registry, DEFAULT_VOLUME_ID) ?? findVolume(registry, registry.activeVolumeId);
  const rest = registry.volumes.filter((v) => v.id !== pref?.id);
  return pref ? [pref, ...rest] : registry.volumes;
}
