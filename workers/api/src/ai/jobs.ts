import type { Env } from '../env';
import type { AuthUser } from '../auth';
import type { AiJobRecord, AiJobStatus, AiMediaKind } from '@webbook/shared';
import { getFile, putFile } from '../github';
import { storeUserAsset } from '../volumes';
import { pollSeedanceTask, submitSeedanceTask } from './adapters/seedanceVideo';
import { pollTripoTask, submitTripoTask } from './adapters/tripoModel3d';

function jobPath(userId: string, jobId: string): string {
  return `data/users/${userId}/ai-jobs/${jobId}.json`;
}

export async function loadAiJob(
  env: Env,
  userId: string,
  jobId: string,
): Promise<AiJobRecord | null> {
  const raw = await getFile(env, jobPath(userId, jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiJobRecord;
  } catch {
    return null;
  }
}

async function saveAiJob(env: Env, job: AiJobRecord): Promise<void> {
  await putFile(
    env,
    jobPath(job.userId, job.id),
    JSON.stringify(job, null, 2),
    `ai job: ${job.id} ${job.status}`,
  );
}

async function fetchToAsset(
  env: Env,
  userId: string,
  url: string,
  ext: string,
  label: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${label} failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const filename = `${crypto.randomUUID()}.${ext}`;
  const stored = await storeUserAsset(env, userId, filename, bytes, `ai ${label}: ${filename}`);
  return stored.url;
}

export async function createAsyncAiJob(
  env: Env,
  user: AuthUser,
  input: {
    kind: AiMediaKind;
    provider: string;
    model: string;
    prompt: string;
    params?: Record<string, unknown>;
  },
): Promise<AiJobRecord> {
  const now = new Date().toISOString();
  const job: AiJobRecord = {
    id: crypto.randomUUID(),
    userId: user.id,
    kind: input.kind,
    provider: input.provider,
    model: input.model,
    prompt: input.prompt,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };

  if (input.provider === 'seedance' && input.kind === 'video') {
    const taskId = await submitSeedanceTask(env, {
      prompt: input.prompt,
      model: input.model,
      duration: Number(input.params?.duration ?? 5),
      resolution: String(input.params?.resolution ?? '720p'),
      ratio: String(input.params?.ratio ?? '16:9'),
      generateAudio: Boolean(input.params?.generateAudio),
      watermark: input.params?.watermark === true,
    });
    job.providerTaskId = taskId;
    job.status = 'running';
  } else if (input.provider === 'tripo' && input.kind === 'model3d') {
    const taskId = await submitTripoTask(env, {
      prompt: input.prompt,
      model: input.model,
    });
    job.providerTaskId = taskId;
    job.status = 'running';
  } else {
    throw new Error(`async provider not supported: ${input.provider}/${input.kind}`);
  }

  await saveAiJob(env, job);
  return job;
}

export async function refreshAiJob(env: Env, user: AuthUser, jobId: string): Promise<AiJobRecord> {
  const job = await loadAiJob(env, user.id, jobId);
  if (!job) throw new Error('job not found');
  if (job.status === 'succeeded' || job.status === 'failed') return job;
  if (!job.providerTaskId) {
    job.status = 'failed';
    job.error = 'missing providerTaskId';
    job.updatedAt = new Date().toISOString();
    await saveAiJob(env, job);
    return job;
  }

  try {
    if (job.provider === 'seedance') {
      const polled = await pollSeedanceTask(env, job.providerTaskId);
      if (polled.status === 'running' || polled.status === 'queued') {
        job.status = 'running';
      } else if (polled.status === 'failed') {
        job.status = 'failed';
        job.error = polled.error || 'seedance failed';
      } else if (polled.status === 'succeeded' && polled.videoUrl) {
        job.resultUrl = await fetchToAsset(env, user.id, polled.videoUrl, 'mp4', 'video');
        job.status = 'succeeded';
      }
    } else if (job.provider === 'tripo') {
      const polled = await pollTripoTask(env, job.providerTaskId);
      if (polled.status === 'running' || polled.status === 'queued') {
        job.status = 'running';
      } else if (polled.status === 'failed') {
        job.status = 'failed';
        job.error = polled.error || 'tripo failed';
      } else if (polled.status === 'succeeded' && polled.modelUrl) {
        job.resultUrl = await fetchToAsset(env, user.id, polled.modelUrl, 'glb', 'model3d');
        if (polled.posterUrl) {
          try {
            job.posterUrl = await fetchToAsset(env, user.id, polled.posterUrl, 'png', 'poster');
          } catch {
            /* poster optional */
          }
        }
        job.status = 'succeeded';
      }
    } else {
      job.status = 'failed';
      job.error = `unknown provider ${job.provider}`;
    }
  } catch (e) {
    job.status = 'failed';
    job.error = (e as Error).message || 'poll error';
  }

  job.updatedAt = new Date().toISOString();
  await saveAiJob(env, job);
  return job;
}

export function jobToGenerateKind(
  job: AiJobRecord,
): { kind: 'job'; jobId: string; provider: string; model: string; status: AiJobStatus } {
  return {
    kind: 'job',
    jobId: job.id,
    provider: job.provider,
    model: job.model,
    status: job.status,
  };
}
