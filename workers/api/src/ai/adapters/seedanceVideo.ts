import type { Env } from '../../env';

function arkKey(env: Env): string {
  const k = env.VOLC_API_KEY?.trim();
  if (!k) throw new Error('missing VOLC_API_KEY for Seedance');
  return k;
}

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

export async function submitSeedanceTask(
  env: Env,
  opts: {
    prompt: string;
    model: string;
    duration: number;
    resolution: string;
    ratio: string;
    generateAudio: boolean;
    watermark: boolean;
  },
): Promise<string> {
  const res = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${arkKey(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model || 'doubao-seedance-1-0-lite-t2v',
      content: [{ type: 'text', text: opts.prompt }],
      duration: opts.duration || 5,
      resolution: opts.resolution || '720p',
      ratio: opts.ratio || '16:9',
      generate_audio: opts.generateAudio,
      watermark: opts.watermark,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`seedance submit ${res.status}: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('seedance: no task id');
  return data.id;
}

export async function pollSeedanceTask(
  env: Env,
  taskId: string,
): Promise<{
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  videoUrl?: string;
  error?: string;
}> {
  const res = await fetch(`${ARK_BASE}/contents/generations/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${arkKey(env)}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`seedance poll ${res.status}: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    status?: string;
    content?: { video_url?: string };
    error?: { message?: string };
  };
  const st = (data.status || '').toLowerCase();
  if (st === 'succeeded' || st === 'success') {
    return { status: 'succeeded', videoUrl: data.content?.video_url };
  }
  if (st === 'failed' || st === 'expired' || st === 'cancelled') {
    return { status: 'failed', error: data.error?.message || st };
  }
  if (st === 'queued' || st === 'pending') return { status: 'queued' };
  return { status: 'running' };
}
