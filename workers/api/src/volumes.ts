import type { Env } from './env';
import { getFile, putBinaryFile, putFile } from './github';

/** 逻辑卷 id；首版物理上可与 meta 仓相同 */
export const DEFAULT_VOLUME_ID = 'vol-01';

/** 控制面：卷清单存在 meta 仓（GITHUB_REPO） */
export const VOLUMES_REGISTRY_PATH = 'data/registry/volumes.json';

/** Contents API 单文件软顶（留余量，远离 100MB 硬墙） */
export const MAX_ASSET_BYTES = 40 * 1024 * 1024;

export type VolumeStatus = 'active' | 'filling' | 'sealed';

export interface StorageVolume {
  id: string;
  /** owner/name，如 heyuan-cyber/webbook-vol-02 */
  repo: string;
  status: VolumeStatus;
  role: 'assets' | 'meta';
  softLimitBytes?: number;
  note?: string;
}

export interface VolumeRegistry {
  schemaVersion: 1;
  activeVolumeId: string;
  volumes: StorageVolume[];
}

export function defaultVolumeRegistry(env: Env): VolumeRegistry {
  return {
    schemaVersion: 1,
    activeVolumeId: DEFAULT_VOLUME_ID,
    volumes: [
      {
        id: DEFAULT_VOLUME_ID,
        repo: env.GITHUB_REPO,
        status: 'active',
        role: 'assets',
        softLimitBytes: 800_000_000,
        note: '逻辑卷；物理可与 meta 同仓，满后可指向新 repo',
      },
    ],
  };
}

function normalizeRegistry(env: Env, raw: unknown): VolumeRegistry {
  const fallback = defaultVolumeRegistry(env);
  if (!raw || typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;
  const volumesIn = Array.isArray(o.volumes) ? o.volumes : [];
  const volumes: StorageVolume[] = [];
  for (const v of volumesIn) {
    if (!v || typeof v !== 'object') continue;
    const x = v as Record<string, unknown>;
    const id = typeof x.id === 'string' ? x.id.trim() : '';
    const repo = typeof x.repo === 'string' ? x.repo.trim() : '';
    if (!id || !repo) continue;
    const status =
      x.status === 'sealed' || x.status === 'filling' || x.status === 'active'
        ? x.status
        : 'sealed';
    volumes.push({
      id,
      repo,
      status,
      role: x.role === 'meta' ? 'meta' : 'assets',
      softLimitBytes: typeof x.softLimitBytes === 'number' ? x.softLimitBytes : undefined,
      note: typeof x.note === 'string' ? x.note : undefined,
    });
  }
  if (volumes.length === 0) return fallback;
  let activeVolumeId =
    typeof o.activeVolumeId === 'string' ? o.activeVolumeId.trim() : volumes[0]!.id;
  if (!volumes.some((v) => v.id === activeVolumeId)) {
    activeVolumeId = volumes.find((v) => v.status === 'active')?.id ?? volumes[0]!.id;
  }
  return { schemaVersion: 1, activeVolumeId, volumes };
}

/** 从 meta 仓加载卷表；缺失则返回默认（不强制写盘） */
export async function loadVolumeRegistry(env: Env): Promise<VolumeRegistry> {
  try {
    const text = await getFile(env, VOLUMES_REGISTRY_PATH);
    if (!text) return defaultVolumeRegistry(env);
    return normalizeRegistry(env, JSON.parse(text) as unknown);
  } catch {
    return defaultVolumeRegistry(env);
  }
}

/** 管理员/运维可调用：把当前 registry 写回 meta（首次启用显式分卷时） */
export async function saveVolumeRegistry(env: Env, registry: VolumeRegistry): Promise<void> {
  const body = JSON.stringify(
    {
      schemaVersion: 1,
      activeVolumeId: registry.activeVolumeId,
      volumes: registry.volumes,
    },
    null,
    2,
  );
  await putFile(env, VOLUMES_REGISTRY_PATH, body, 'chore: update volume registry');
}

export function findVolume(
  registry: VolumeRegistry,
  volumeId: string,
): StorageVolume | undefined {
  return registry.volumes.find((v) => v.id === volumeId);
}

export function getWritableVolume(registry: VolumeRegistry): StorageVolume {
  const active = findVolume(registry, registry.activeVolumeId);
  if (active && active.status !== 'sealed') return active;
  const fallback = registry.volumes.find((v) => v.status === 'active' || v.status === 'filling');
  if (fallback) return fallback;
  throw new Error('no writable storage volume (all sealed?)');
}

export function isVolumeId(id: string): boolean {
  return /^vol-[\w.-]+$/i.test(id);
}

export function assetPublicUrl(volumeId: string, filename: string): string {
  return `/api/assets/${volumeId}/${filename}`;
}

/** 解析 /api/assets/... 或完整 URL → volume + filename */
export function parseAssetRef(
  pathOrUrl: string,
): { volumeId: string | null; name: string } | null {
  let path = pathOrUrl.trim();
  try {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      path = new URL(path).pathname;
    }
  } catch {
    /* keep raw */
  }
  const withVol = path.match(/\/api\/assets\/(vol-[\w.-]+)\/([^/?#]+)$/i);
  if (withVol) {
    return { volumeId: withVol[1]!, name: withVol[2]! };
  }
  const legacy = path.match(/\/api\/assets\/([^/?#]+)$/);
  if (legacy && !isVolumeId(legacy[1]!)) {
    return { volumeId: null, name: legacy[1]! };
  }
  return null;
}

export function userAssetPath(userId: string, filename: string): string {
  return `data/users/${userId}/assets/${filename}`;
}

/**
 * 写入用户资产到 active 卷；返回带卷号的公开 URL。
 * 物理上 active.repo 可与 GITHUB_REPO 相同（Phase 0）。
 */
export async function storeUserAsset(
  env: Env,
  userId: string,
  filename: string,
  bytes: Uint8Array,
  message: string,
): Promise<{ url: string; volumeId: string; repo: string }> {
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`asset exceeds ${MAX_ASSET_BYTES} bytes limit`);
  }
  const registry = await loadVolumeRegistry(env);
  const vol = getWritableVolume(registry);
  const path = userAssetPath(userId, filename);
  await putBinaryFile(env, path, bytes, message, vol.repo);
  return {
    url: assetPublicUrl(vol.id, filename),
    volumeId: vol.id,
    repo: vol.repo,
  };
}

/** 确保 meta 仓有一份 volumes.json（幂等）；部署后可调一次 */
export async function ensureVolumeRegistry(env: Env): Promise<VolumeRegistry> {
  const existing = await getFile(env, VOLUMES_REGISTRY_PATH);
  if (existing) return normalizeRegistry(env, JSON.parse(existing) as unknown);
  const reg = defaultVolumeRegistry(env);
  await saveVolumeRegistry(env, reg);
  return reg;
}
