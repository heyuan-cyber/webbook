import type { Env } from '../env';
import { buildAiTools, executeAiTool } from './tools/index';

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

const MAX_TOOL_ROUNDS = 6;

/** DeepSeek OpenAI 兼容：带 tool calling 的多轮对话 */
export async function chatWithTools(env: Env, messages: ChatMessage[]): Promise<string> {
  if (!env.AI_API_KEY) throw new Error('AI_API_KEY not configured');

  const tools = buildAiTools(env);
  if (!tools.length) {
    throw new Error('No web tools configured');
  }

  const msgs: ChatMessage[] = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.AI_MODEL,
        messages: msgs,
        tools,
        tool_choice: 'auto',
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`AI provider error: ${res.status}`);

    const data = (await res.json()) as {
      choices: { message: ChatMessage & { tool_calls?: ToolCall[] } }[];
    };
    const message = data.choices[0]?.message;
    if (!message) return '';

    const toolCalls = message.tool_calls;
    if (!toolCalls?.length) {
      return message.content ?? '';
    }

    msgs.push({
      role: 'assistant',
      content: message.content,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      const result = await executeAiTool(env, call.function.name, args);
      msgs.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }

  throw new Error('AI tool loop exceeded max rounds');
}
