import type { Env } from './env';
import type { Note } from '@webbook/shared';
import { parseAiChatResponse, type AiChatResult } from '@webbook/shared';
import { chatWithTools } from './ai/chatWithTools';
import { hasWebTools, needsWebResearch } from './ai/tools/index';

export type { AiChatResult };

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
          return b.items.map((item, idx) =>
            b.ordered ? `${idx + 1}. ${item}` : `- ${item}`,
          ).join('\n');
        case 'link-preview':
          return b.title ? `[${b.title}](${b.url})` : b.url;
        case 'divider':
          return '---';
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}

/** 多轮对话（OpenAI 兼容 messages） */
export async function chatMessages(
  env: Env,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { jsonObject?: boolean },
): Promise<string> {
  if (!env.AI_API_KEY) throw new Error('AI_API_KEY not configured');
  const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages,
      stream: false,
      ...(opts?.jsonObject ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`AI provider error: ${res.status}`);
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0]?.message?.content ?? '';
}

/** 编辑器内 AI 助手：带笔记上下文的多轮对话 */
export async function assistNoteChat(
  env: Env,
  note: Note,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<AiChatResult> {
  const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const useWebTools = hasWebTools(env) && needsWebResearch(lastUser);

  const systemParts = [
    '你是 WebBook 笔记写作助手，帮助用户从零搭建、扩写、润色和整理笔记内容。',
    '用户只说自然语言意图，你负责推断排版结构；用户不需要指定 Markdown 格式。',
    '',
    '你必须只输出一个 JSON 对象（不要用 markdown 代码块包裹），格式：',
    '{"reply":"简短中文对话回复","noteMarkdown":"笔记正文 Markdown 草稿"}',
    '',
    'noteMarkdown 规则：',
    '- 用 # ## ### 表示标题；用 - 无序列表；用 - [ ] / - [x] 待办',
    '- 需要链接时用 [标题](https://...) 行内格式，或单独一行裸 URL',
    '- 禁止编造不存在的 URL 或新闻事实',
    '- 长内容放 noteMarkdown；reply 保持 1-3 句',
    '- 禁止把长笔记正文写在 reply；noteMarkdown 必须含 ## 分类与 - 列表条目',
    '- noteMarkdown 正文禁止未转义的英文双引号 "，引用改用「」或『』，确保 JSON 合法',
    '',
    'noteMarkdown 示例：',
    '# 今日新闻\\n\\n## 科技\\n- [标题](https://example.com) — 一句分析\\n\\n## 小结\\n今日要点…',
    '',
    '不要擅自假设用户已同意修改笔记。',
  ];

  if (useWebTools) {
    systemParts.push(
      '',
      '联网模式：用户需要搜索、调研或实时资讯。',
      '- 优先调用 research_topic 做全面检索（国内+国际多源，国内约占七成）',
      '- 若结果仍不足，可用 web_search 换关键词或 fetch_rss_feeds 补充',
      '- noteMarkdown 中的每条链接必须来自工具返回的 URL，不得自行编造',
      '- 按主题分类排版，尽量覆盖工具返回的主要条目，国内来源放在前面',
      '- 标注「区域: 国内」的条目应多于「区域: 国际」',
      '- 若工具无结果，reply 说明原因，noteMarkdown 留空字符串',
    );
  } else {
    systemParts.push(
      '- 若用户要求整理「今日新闻」等但未提供链接/摘录，且无法调用联网工具，reply 说明请提供素材或配置 RSS/搜索 API，noteMarkdown 留空字符串',
    );
  }

  systemParts.push(
    '',
    `当前笔记标题：${note.title}`,
    '当前笔记正文：',
    noteToText(note) || '（空）',
  );

  const system = systemParts.join('\n');
  const messages = [
    { role: 'system' as const, content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const raw = useWebTools
    ? await chatWithTools(env, messages)
    : await chatMessages(env, messages, { jsonObject: true });
  return parseAiChatResponse(raw);
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
