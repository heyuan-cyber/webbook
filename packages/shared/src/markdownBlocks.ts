import type { Block } from './blocks.js';

function newBlockId(): string {
  return `blk-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const CHECKBOX_RE = /^-\s+\[([ xX])\]\s+(.+)$/;
const UL_RE = /^[-*+]\s+(.+)$/;
const OL_RE = /^\d+\.\s+(.+)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const BLOCKQUOTE_RE = /^>\s?(.+)$/;
const URL_RE = /^https?:\/\/\S+$/i;

function isBlockStarter(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    CHECKBOX_RE.test(line) ||
    BLOCKQUOTE_RE.test(line) ||
    URL_RE.test(line) ||
    OL_RE.test(line) ||
    UL_RE.test(line)
  );
}

function pushParagraph(blocks: Block[], lines: string[]) {
  const text = lines.join('\n').trimEnd();
  if (!text) return;
  blocks.push({ id: newBlockId(), type: 'paragraph', text });
}

/** 将 AI 输出的 Markdown 草稿转为 WebBook blocks[]（列表/待办/引用并入 paragraph） */
export function markdownToBlocks(markdown: string): Block[] {
  const text = markdown.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const heading = trimmed.match(HEADING_RE);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ id: newBlockId(), type: 'heading', level, text: heading[2].trim() });
      i++;
      continue;
    }

    if (HR_RE.test(trimmed)) {
      blocks.push({ id: newBlockId(), type: 'divider' });
      i++;
      continue;
    }

    if (URL_RE.test(trimmed)) {
      blocks.push({ id: newBlockId(), type: 'link-preview', url: trimmed });
      i++;
      continue;
    }

    // 任务列表 / 无序 / 有序 / 引用 → 连续行写入同一个 paragraph
    if (
      CHECKBOX_RE.test(trimmed) ||
      BLOCKQUOTE_RE.test(trimmed) ||
      OL_RE.test(trimmed) ||
      UL_RE.test(trimmed)
    ) {
      const chunk: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t) break;
        if (
          CHECKBOX_RE.test(t) ||
          BLOCKQUOTE_RE.test(t) ||
          OL_RE.test(t) ||
          UL_RE.test(t)
        ) {
          chunk.push(t);
          i++;
          continue;
        }
        break;
      }
      pushParagraph(blocks, chunk);
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || isBlockStarter(t)) break;
      paraLines.push(t);
      i++;
    }
    pushParagraph(blocks, paraLines);
  }

  return blocks;
}
