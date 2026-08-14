import type { Env } from '../../env';

/** OpenAI Images API（gpt-image-1 / dall-e） */
export async function generateOpenAiImage(
  env: Env,
  prompt: string,
  model: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('missing OPENAI_API_KEY');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`openai image ${res.status}: ${t.slice(0, 240)}`);
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
    if (!img.ok) throw new Error(`openai image download ${img.status}`);
    return {
      bytes: new Uint8Array(await img.arrayBuffer()),
      mime: img.headers.get('content-type') || 'image/png',
    };
  }
  throw new Error('openai image: empty response');
}
