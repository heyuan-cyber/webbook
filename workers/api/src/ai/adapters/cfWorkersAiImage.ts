import type { Env } from '../../env';

function stepsForQuality(quality?: string): number {
  if (quality === 'standard') return 8;
  return 4; // fast
}

/**
 * Cloudflare Workers AI 生图。
 * 优先用 wrangler `AI` binding；本地/备用可用 ACCOUNT_ID + API_TOKEN REST。
 */
export async function generateCfWorkersAiImage(
  env: Env,
  prompt: string,
  model: string,
  quality?: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const modelId = model || '@cf/black-forest-labs/flux-1-schnell';
  const steps = stepsForQuality(quality);

  if (env.AI) {
    const result = (await env.AI.run(modelId, {
      prompt,
      num_steps: steps,
    })) as { image?: string } | ArrayBuffer | Uint8Array;

    if (result && typeof result === 'object' && 'image' in result && typeof result.image === 'string') {
      const bin = Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0));
      return { bytes: bin, mime: 'image/jpeg' };
    }
    if (result instanceof Uint8Array) {
      return { bytes: result, mime: 'image/png' };
    }
    if (result instanceof ArrayBuffer) {
      return { bytes: new Uint8Array(result), mime: 'image/png' };
    }
    throw new Error('unexpected Workers AI image response shape');
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error('AI binding missing and CLOUDFLARE_ACCOUNT_ID/TOKEN not set');
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, num_steps: steps }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Workers AI REST ${res.status}: ${t.slice(0, 240)}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as { result?: { image?: string }; image?: string };
    const b64 = data.result?.image || data.image;
    if (!b64) throw new Error('Workers AI JSON missing image');
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { bytes: bin, mime: 'image/jpeg' };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, mime: contentType.includes('jpeg') ? 'image/jpeg' : 'image/png' };
}
