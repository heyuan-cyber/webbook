import type { Env } from './env';
import type { AuthUser } from './auth';
import { getBinaryFile } from './github';
import { listKnownUserIds } from './usersRegistry';

/** Resolve uploaded asset bytes; <img> requests have no JWT so we fall back to UUID lookup across users. */
export async function resolveAssetBytes(
  env: Env,
  name: string,
  user: AuthUser | null,
): Promise<Uint8Array | null> {
  if (user) {
    const own = await getBinaryFile(env, `data/users/${user.id}/assets/${name}`);
    if (own) return own;
  }
  const legacy = await getBinaryFile(env, `data/assets/${name}`);
  if (legacy) return legacy;
  for (const uid of await listKnownUserIds(env)) {
    if (user?.id === uid) continue;
    const bytes = await getBinaryFile(env, `data/users/${uid}/assets/${name}`);
    if (bytes) return bytes;
  }
  return null;
}
