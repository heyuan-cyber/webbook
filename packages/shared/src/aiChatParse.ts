export interface AiChatResult {
  reply: string;
  noteMarkdown?: string;
}

const MD_STRUCTURE_RE = /^(#{1,3}\s|[-*+]\s|>\s|\d+\.\s|-\s+\[[ xX]\])/m;

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function tryParseJsonObject(text: string): AiChatResult | null {
  try {
    const obj = JSON.parse(text) as { reply?: unknown; noteMarkdown?: unknown };
    if (typeof obj.reply !== 'string') return null;
    const noteMarkdown =
      typeof obj.noteMarkdown === 'string' ? obj.noteMarkdown.trim() : undefined;
    return {
      reply: obj.reply.trim(),
      noteMarkdown: noteMarkdown || undefined,
    };
  } catch {
    return null;
  }
}

function extractJsonCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const candidates = new Set<string>();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) candidates.add(fenced[1].trim());

  candidates.add(trimmed);

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return [...candidates];
}

function looksLikeNoteMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (MD_STRUCTURE_RE.test(t)) return true;
  if (t.includes('\n## ') || t.includes('\n- ')) return true;
  if (t.startsWith('#')) return true;
  return t.length > 120 && t.includes('\n');
}

/** 检测是否为未解析的 AI JSON 原文 */
export function looksLikeAiJsonBlob(text: string): boolean {
  const t = text.trim();
  return t.startsWith('{') && t.includes('"reply"') && t.includes('"noteMarkdown"');
}

/** JSON 非法时，从 noteMarkdown 字段后第一个 # 起截取 Markdown */
function salvageNoteMarkdown(raw: string): string | undefined {
  const keyIdx = raw.indexOf('"noteMarkdown"');
  if (keyIdx < 0) return undefined;

  const hashIdx = raw.indexOf('#', keyIdx);
  if (hashIdx < 0) return undefined;

  const closeBrace = raw.lastIndexOf('}');
  if (closeBrace <= hashIdx) return undefined;

  let md = raw.slice(hashIdx, closeBrace).trimEnd();
  if (md.endsWith('"')) md = md.slice(0, -1).trimEnd();

  md = unescapeJsonString(md);
  return md.trim() || undefined;
}

/** JSON 非法时，尽量提取简短 reply（通常无内嵌引号） */
function salvageReply(raw: string): string | undefined {
  const strict = raw.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"\s*,/);
  if (strict?.[1]) return unescapeJsonString(strict[1]).trim();

  const loose = raw.match(/"reply"\s*:\s*"([\s\S]*?)"\s*,\s*"noteMarkdown"/);
  if (loose?.[1]) return unescapeJsonString(loose[1]).trim();

  return undefined;
}

function salvageBrokenAiJson(raw: string): AiChatResult | null {
  const noteMarkdown = salvageNoteMarkdown(raw);
  const reply = salvageReply(raw);
  if (!noteMarkdown && !reply) return null;
  return normalizeResult(
    reply ?? '已生成笔记草稿，请在下方预览后应用到笔记。',
    noteMarkdown,
  );
}

function normalizeResult(reply: string, noteMarkdown?: string): AiChatResult {
  const md = noteMarkdown?.trim();
  const shortReply = reply.trim();

  if (md) {
    return { reply: shortReply, noteMarkdown: md };
  }

  if (looksLikeNoteMarkdown(shortReply)) {
    return {
      reply: '已生成笔记草稿，请在下方预览后应用到笔记。',
      noteMarkdown: shortReply,
    };
  }

  return { reply: shortReply };
}

/** 解析 AI 聊天原始输出为 reply + noteMarkdown */
export function parseAiChatResponse(raw: string): AiChatResult {
  for (const candidate of extractJsonCandidates(raw)) {
    const parsed = tryParseJsonObject(candidate);
    if (parsed) return normalizeResult(parsed.reply, parsed.noteMarkdown);
  }

  if (looksLikeAiJsonBlob(raw)) {
    const salvaged = salvageBrokenAiJson(raw);
    if (salvaged) return salvaged;
    return { reply: 'AI 返回格式无法解析，请重试生成。' };
  }

  const trimmed = raw.trim();
  if (looksLikeNoteMarkdown(trimmed)) {
    return {
      reply: '已生成笔记草稿，请在下方预览后应用到笔记。',
      noteMarkdown: trimmed,
    };
  }

  return { reply: raw };
}

/** 合并 API 字段与对 reply 的二次解析，尽量得到可排版 Markdown */
export function resolveAiDraft(reply: string, noteMarkdown?: string): AiChatResult {
  if (noteMarkdown?.trim()) {
    return { reply: reply.trim(), noteMarkdown: noteMarkdown.trim() };
  }
  return parseAiChatResponse(reply);
}
