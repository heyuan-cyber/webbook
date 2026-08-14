import type { Env } from '../../env';
import { CF_FLUX_2_KLEIN, CF_FLUX_SCHNELL } from '@webbook/shared';

function toBlobPart(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function stepsForQuality(quality?: string): number {
  if (quality === 'standard') return 8;
  return 4;
}

function decodeImageResult(result: unknown): { bytes: Uint8Array; mime: string } {
  if (result && typeof result === 'object' && 'image' in result && typeof (result as { image: unknown }).image === 'string') {
    const bin = Uint8Array.from(atob((result as { image: string }).image), (c) => c.charCodeAt(0));
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

async function resizeHint(_bytes: Uint8Array): Promise<Uint8Array> {
  // FLUX.2 要求参考图 < 512×512；Worker 内无 canvas 时原样提交，超限由上游报错
  return _bytes;
}

/**
 * Cloudflare Workers AI 生图。
 * - 无参考图：默认 FLUX.1 Schnell（JSON prompt + steps）
 * - 有参考图：强制 FLUX.2 klein multipart（input_image_0…）
 */
export async function generateCfWorkersAiImage(
  env: Env,
  prompt: string,
  model: string,
  quality?: string,
  referenceImages?: Uint8Array[],
): Promise<{ bytes: Uint8Array; mime: string; modelUsed: string }> {
  const refs = (referenceImages ?? []).slice(0, 4);
  const useRefs = refs.length > 0;
  const modelId = useRefs
    ? CF_FLUX_2_KLEIN
    : model || CF_FLUX_SCHNELL;
  const steps = stepsForQuality(quality);

  if (env.AI) {
    if (useRefs) {
      const form = new FormData();
      form.append('prompt', prompt);
      for (let i = 0; i < refs.length; i++) {
        const bytes = await resizeHint(refs[i]!);
        form.append(
          `input_image_${i}`,
          new Blob([toBlobPart(bytes)], { type: 'image/png' }),
          `ref${i}.png`,
        );
      }
      const result = await env.AI.run(modelId, {
        multipart: {
          body: form,
          contentType: 'multipart/form-data',
        },
      } as Record<string, unknown>);
      const decoded = decodeImageResult(result);
      return { ...decoded, modelUsed: modelId };
    }

    const result = await env.AI.run(modelId, {
      prompt,
      steps,
    } as Record<string, unknown>);
    const decoded = decodeImageResult(result);
    return { ...decoded, modelUsed: modelId };
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    throw new Error('AI binding missing and CLOUDFLARE_ACCOUNT_ID/TOKEN not set');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`;

  if (useRefs) {
    const form = new FormData();
    form.append('prompt', prompt);
    for (let i = 0; i < refs.length; i++) {
      const bytes = await resizeHint(refs[i]!);
      form.append(`input_image_${i}`, new Blob([toBlobPart(bytes)], { type: 'image/png' }), `ref${i}.png`);
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Workers AI REST ${res.status}: ${t.slice(0, 240)}`);
    }
    return { ...(await parseRestImage(res)), modelUsed: modelId };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, steps }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Workers AI REST ${res.status}: ${t.slice(0, 240)}`);
  }
  return { ...(await parseRestImage(res)), modelUsed: modelId };
}

async function parseRestImage(res: Response): Promise<{ bytes: Uint8Array; mime: string }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as {
      result?: { image?: string };
      image?: string;
    };
    const b64 = data.result?.image || data.image;
    if (!b64) throw new Error('Workers AI JSON missing image');
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { bytes: bin, mime: 'image/jpeg' };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, mime: contentType.includes('jpeg') ? 'image/jpeg' : 'image/png' };
}
