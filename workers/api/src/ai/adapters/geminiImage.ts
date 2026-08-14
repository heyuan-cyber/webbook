import type { Env } from '../../env';

/** Gemini 原生图生成（generateContent） */
export async function generateGeminiImage(
  env: Env,
  prompt: string,
  model: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('missing GEMINI_API_KEY');
  const modelId = model || 'gemini-2.0-flash-preview-image-generation';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`gemini image ${res.status}: ${t.slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      return {
        bytes: Uint8Array.from(atob(p.inlineData.data), (c) => c.charCodeAt(0)),
        mime: p.inlineData.mimeType || 'image/png',
      };
    }
  }
  throw new Error('gemini: no image in response');
}
