import type { Block } from './blocks.js';
import {
  decodeFeishuMediaPath,
  isFeishuAudioPath,
  isFeishuVideoPath,
  unescapeFeishuAlt,
} from './feishuZip.js';

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
/** 整行图片：![alt](path) */
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
/** 整行链接：[label](path) */
const LINK_LINE_RE = /^\[([^\]]*)\]\(([^)]+)\)$/;

function isBlockStarter(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    HR_RE.test(line) ||
    CHECKBOX_RE.test(line) ||
    BLOCKQUOTE_RE.test(line) ||
    URL_RE.test(line) ||
    IMAGE_LINE_RE.test(line) ||
    LINK_LINE_RE.test(line) ||
    OL_RE.test(line) ||
    UL_RE.test(line)
  );
}

function pushParagraph(blocks: Block[], lines: string[]) {
  const text = lines.join('\n').trimEnd();
  if (!text) return;
  blocks.push({ id: newBlockId(), type: 'paragraph', text });
}

function isListLikeLine(t: string): boolean {
  return CHECKBOX_RE.test(t) || BLOCKQUOTE_RE.test(t) || OL_RE.test(t) || UL_RE.test(t);
}

function peekNextNonEmpty(lines: string[], from: number): string | null {
  for (let j = from; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t) return t;
  }
  return null;
}

/**
 * 将 Markdown（含飞书下载格式的图/视频行）转为 WebBook blocks[]。
 * 列表/待办/引用并入 paragraph；同类列表遇空行不拆块（飞书 zip 常见「一条一块」过稀）。
 * 媒体 src 可为相对路径，由导入层再替换为 asset URL。
 */
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

    const imageLine = trimmed.match(IMAGE_LINE_RE);
    if (imageLine) {
      const alt = unescapeFeishuAlt(imageLine[1]);
      const src = decodeFeishuMediaPath(imageLine[2]);
      blocks.push({
        id: newBlockId(),
        type: 'image',
        src,
        alt: alt || undefined,
      });
      i++;
      continue;
    }

    const linkLine = trimmed.match(LINK_LINE_RE);
    if (linkLine) {
      const label = unescapeFeishuAlt(linkLine[1]);
      const href = decodeFeishuMediaPath(linkLine[2]);
      if (isFeishuVideoPath(href)) {
        blocks.push({
          id: newBlockId(),
          type: 'video',
          src: href,
          caption: label || undefined,
        });
      } else if (isFeishuAudioPath(href)) {
        blocks.push({
          id: newBlockId(),
          type: 'audio',
          src: href,
          title: label || undefined,
        });
      } else if (/^https?:\/\//i.test(href)) {
        blocks.push({ id: newBlockId(), type: 'link-preview', url: href, title: label || undefined });
      } else {
        // 其它相对附件：保留为带链接的段落，便于导入层处理
        blocks.push({
          id: newBlockId(),
          type: 'paragraph',
          text: `[${label}](${encodeURI(href).replace(/'/g, '%27')})`,
        });
      }
      i++;
      continue;
    }

    if (URL_RE.test(trimmed)) {
      blocks.push({ id: newBlockId(), type: 'link-preview', url: trimmed });
      i++;
      continue;
    }

    // 任务列表 / 无序 / 有序 / 引用 → 同一 paragraph；空行不打断（若后续仍是同类列表行）
    if (isListLikeLine(trimmed)) {
      const chunk: string[] = [];
      while (i < lines.length) {
        const raw = lines[i];
        const t = raw.trim();
        if (!t) {
          const next = peekNextNonEmpty(lines, i + 1);
          if (next && isListLikeLine(next)) {
            i++;
            continue;
          }
          break;
        }
        if (isListLikeLine(t)) {
          chunk.push(raw.replace(/\s+$/g, ''));
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
