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

/** 将 AI 输出的 Markdown 草稿转为 WebBook blocks[] */
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

    const checkbox = trimmed.match(CHECKBOX_RE);
    if (checkbox) {
      blocks.push({
        id: newBlockId(),
        type: 'checkbox',
        checked: checkbox[1].toLowerCase() === 'x',
        text: checkbox[2].trim(),
      });
      i++;
      continue;
    }

    const quote = trimmed.match(BLOCKQUOTE_RE);
    if (quote) {
      blocks.push({ id: newBlockId(), type: 'callout', tone: 'info', text: quote[1].trim() });
      i++;
      continue;
    }

    if (URL_RE.test(trimmed)) {
      blocks.push({ id: newBlockId(), type: 'link-preview', url: trimmed });
      i++;
      continue;
    }

    const ordered = trimmed.match(OL_RE);
    if (ordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const m = t.match(OL_RE);
        if (!m) break;
        items.push(m[1].trim());
        i++;
      }
      if (items.length) blocks.push({ id: newBlockId(), type: 'list', ordered: true, items });
      continue;
    }

    const unordered = trimmed.match(UL_RE);
    if (unordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const m = t.match(UL_RE);
        if (!m) break;
        items.push(m[1].trim());
        i++;
      }
      if (items.length) blocks.push({ id: newBlockId(), type: 'list', ordered: false, items });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t || isBlockStarter(t)) break;
      paraLines.push(t);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ id: newBlockId(), type: 'paragraph', text: paraLines.join('\n') });
    }
  }

  return blocks;
}
