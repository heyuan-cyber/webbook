import type { Env } from '../../env';

/** 用 DeepSeek 根据提示词生成 Markdown 段落正文 */
export async function generateDeepseekText(
  env: Env,
  prompt: string,
  model: string,
): Promise<string> {
  if (!env.AI_API_KEY) throw new Error('AI_API_KEY not configured');
  const base = (env.AI_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model || env.AI_MODEL || 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            '你是笔记写作助手。根据用户描述直接输出可用的 Markdown 正文，不要前言后语，不要包在代码围栏里。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`DeepSeek ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('DeepSeek empty response');
  return text;
}
