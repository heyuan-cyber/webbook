import type { Env } from './env';
import type { Note } from '@webbook/shared';

/** 调用兼容 OpenAI Chat Completions 的 Provider（DeepSeek 等） */
export async function chat(env: Env, system: string, user: string): Promise<string> {
  const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`AI provider error: ${res.status}`);
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? '';
}

function noteToText(note: Note): string {
  return note.blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `${'#'.repeat(b.level)} ${b.text}`;
        case 'paragraph':
        case 'callout':
          return b.text;
        case 'checkbox':
          return `- [${b.checked ? 'x' : ' '}] ${b.text}`;
        case 'list':
          return b.items.map((i) => `- ${i}`).join('\n');
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}

/** summarize 动作 */
export async function summarizeNote(env: Env, note: Note): Promise<string> {
  return chat(
    env,
    '你是笔记助手，请用 2-3 句话归纳笔记要点，使用中文。',
    noteToText(note),
  );
}

/** extract_todos 动作：返回待办文本数组 */
export async function extractTodos(_env: Env, note: Note): Promise<string[]> {
  // 先用结构化 checkbox 块直接提取（零成本）
  const structural = note.blocks
    .filter((b): b is Extract<Note['blocks'][number], { type: 'checkbox' }> => b.type === 'checkbox')
    .filter((b) => !b.checked)
    .map((b) => b.text)
    .filter(Boolean);
  return structural;
}
