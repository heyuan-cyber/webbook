import type { Env } from '../../env';

function arkKey(env: Env): string {
  const k = env.VOLC_API_KEY?.trim();
  if (!k) throw new Error('missing VOLC_API_KEY (Ark Bearer)');
  return k;
}

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

/** Seedream：OpenAI 兼容 images/generations */
export async function generateSeedreamImage(
  env: Env,
  prompt: string,
  model: string,
  opts?: { size?: string },
): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(`${ARK_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${arkKey(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'doubao-seedream-4.0',
      prompt,
      size: opts?.size || '2K',
      response_format: 'b64_json',
      watermark: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`seedream ${res.status}: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = data.data?.[0];
  if (item?.b64_json) {
    return {
      bytes: Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0)),
      mime: 'image/png',
    };
  }
  if (item?.url) {
    const img = await fetch(item.url);
    if (!img.ok) throw new Error(`seedream download ${img.status}`);
    return {
      bytes: new Uint8Array(await img.arrayBuffer()),
      mime: img.headers.get('content-type') || 'image/png',
    };
  }
  throw new Error('seedream: empty image response');
}
