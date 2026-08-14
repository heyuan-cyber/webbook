import type { Env } from '../../env';

const TRIPO_BASE = 'https://api.tripo3d.ai/v2/openapi';

function tripoKey(env: Env): string {
  const k = env.TRIPO_API_KEY?.trim();
  if (!k) throw new Error('missing TRIPO_API_KEY');
  return k;
}

export async function submitTripoTask(
  env: Env,
  opts: { prompt: string; model: string },
): Promise<string> {
  const body: Record<string, unknown> = {
    type: 'text_to_model',
    prompt: opts.prompt,
  };
  // model 字段因账号版本而异；非空时附带
  if (opts.model && opts.model !== 'turbo') {
    body.model_version = opts.model;
  }
  const res = await fetch(`${TRIPO_BASE}/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tripoKey(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`tripo submit ${res.status}: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as { code?: number; data?: { task_id?: string } };
  const id = data.data?.task_id;
  if (!id) throw new Error('tripo: no task_id');
  return id;
}

export async function pollTripoTask(
  env: Env,
  taskId: string,
): Promise<{
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  modelUrl?: string;
  posterUrl?: string;
  error?: string;
}> {
  const res = await fetch(`${TRIPO_BASE}/task/${taskId}`, {
    headers: { Authorization: `Bearer ${tripoKey(env)}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`tripo poll ${res.status}: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    data?: {
      status?: string;
      output?: {
        model?: string;
        pbr_model?: string;
        base_model?: string;
        rendered_image?: string;
      };
    };
  };
  const st = (data.data?.status || '').toLowerCase();
  const out = data.data?.output;
  if (st === 'success' || st === 'succeeded') {
    const modelUrl = out?.pbr_model || out?.model || out?.base_model;
    return {
      status: 'succeeded',
      modelUrl,
      posterUrl: out?.rendered_image,
    };
  }
  if (st === 'failed' || st === 'cancelled' || st === 'banned') {
    return { status: 'failed', error: st };
  }
  if (st === 'queued' || st === 'pending') return { status: 'queued' };
  return { status: 'running' };
}
