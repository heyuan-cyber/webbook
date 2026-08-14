import type { Block } from './blocks.js';
import type { Note } from './note.js';
import {
  FEISHU_MEDIA_DIR,
  encodeFeishuMediaPath,
  escapeFeishuAlt,
  feishuMediaRelativePath,
  suggestMediaFilename,
} from './feishuZip.js';

export type FeishuExportMediaKind = 'image' | 'video' | 'audio' | 'file';

export interface FeishuExportMedia {
  /** zip 内相对路径，如 `图片和附件/a.png` */
  relativePath: string;
  /** WebBook 侧 src（/api/assets/... 或 https） */
  src: string;
  kind: FeishuExportMediaKind;
}

export interface FeishuMarkdownExport {
  markdown: string;
  media: FeishuExportMedia[];
}

function blockSortKey(b: Block): [number, number, number] {
  const pl = b.placement;
  if (pl?.mode === 'absolute') {
    return [1, pl.y ?? 0, pl.x ?? 0];
  }
  return [0, 0, 0];
}

/** flow 保持原序；absolute 按 y、x；整体：先 flow 再 absolute */
function orderedBlocks(blocks: Block[]): Block[] {
  const flow: Block[] = [];
  const absolute: Block[] = [];
  for (const b of blocks) {
    if (b.placement?.mode === 'absolute') absolute.push(b);
    else flow.push(b);
  }
  absolute.sort((a, b) => {
    const ka = blockSortKey(a);
    const kb = blockSortKey(b);
    return ka[1] - kb[1] || ka[2] - kb[2];
  });
  return [...flow, ...absolute];
}

/** 飞书习惯：`image.png` → `image 1.png` → `image 2.png` */
function uniqueFilename(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 1;
  while (used.has(`${stem} ${i}${ext}`)) i++;
  const next = `${stem} ${i}${ext}`;
  used.add(next);
  return next;
}

function pushMedia(
  media: FeishuExportMedia[],
  used: Set<string>,
  src: string,
  kind: FeishuExportMediaKind,
  fallbackPrefix: string,
  defaultExt: string,
): string {
  const suggested = suggestMediaFilename(src, fallbackPrefix, defaultExt);
  const filename = uniqueFilename(used, suggested);
  const relativePath = feishuMediaRelativePath(filename);
  media.push({ relativePath, src, kind });
  return encodeFeishuMediaPath(relativePath);
}

function escapeLinkLabel(label: string): string {
  return escapeFeishuAlt(label.replace(/[\[\]]/g, ''));
}

/**
 * 将笔记序列化为飞书同构 Markdown，并列出需打包进 `图片和附件` 的媒体。
 * 舞台坐标不保留；model3d/canvas 做尽力降级。
 */
export function noteToFeishuMarkdown(note: Pick<Note, 'title' | 'blocks'>): FeishuMarkdownExport {
  const media: FeishuExportMedia[] = [];
  const usedNames = new Set<string>();
  const lines: string[] = [];
  const ordered = orderedBlocks(note.blocks);
  const title = note.title?.trim() || '';

  // 若正文已有同名一级标题，不再重复写 `# title`（对齐飞书下载：通常只有一处）
  const firstHeading = ordered.find((b) => b.type === 'heading');
  const titleAlreadyInBody =
    Boolean(title) &&
    firstHeading?.type === 'heading' &&
    firstHeading.level === 1 &&
    firstHeading.text.trim() === title;

  if (title && !titleAlreadyInBody) {
    lines.push(`# ${title}`, '');
  }

  for (const b of ordered) {
    switch (b.type) {
      case 'heading': {
        const hashes = '#'.repeat(Math.min(Math.max(b.level, 1), 3));
        lines.push(`${hashes} ${b.text}`.trimEnd(), '');
        break;
      }
      case 'paragraph':
      case 'callout': {
        // 保留段内缩进列表等原文（导入时已尽量保留 leading spaces）
        if (b.text.trim()) lines.push(b.text, '');
        break;
      }
      case 'sticky': {
        if (b.text.trim()) lines.push(`> ${b.text.replace(/\n/g, '\n> ')}`, '');
        break;
      }
      case 'list': {
        for (const item of b.items) {
          lines.push(b.ordered ? `1. ${item}` : `- ${item}`);
        }
        lines.push('');
        break;
      }
      case 'checkbox': {
        lines.push(`- [${b.checked ? 'x' : ' '}] ${b.text}`, '');
        break;
      }
      case 'divider': {
        lines.push('---', '');
        break;
      }
      case 'link-preview': {
        lines.push(b.url, '');
        break;
      }
      case 'image': {
        const href = pushMedia(media, usedNames, b.src, 'image', 'image', '.png');
        const rawAlt = (b.alt || b.caption || 'image.png').replace(/[\[\]]/g, '');
        lines.push(`![${escapeFeishuAlt(rawAlt)}](${href})`, '');
        break;
      }
      case 'video': {
        const href = pushMedia(media, usedNames, b.src, 'video', 'video', '.mp4');
        const fileLabel = decodeURIComponent(href.split('/').pop() || 'video.mp4');
        const label = escapeLinkLabel(b.caption || fileLabel);
        lines.push(`[${label}](${href})`, '');
        break;
      }
      case 'audio': {
        const href = pushMedia(media, usedNames, b.src, 'audio', 'audio', '.mp3');
        const fileLabel = decodeURIComponent(href.split('/').pop() || 'audio.mp3');
        const label = escapeLinkLabel(b.title || b.caption || fileLabel);
        lines.push(`[${label}](${href})`, '');
        break;
      }
      case 'model3d': {
        if (b.src) {
          const href = pushMedia(media, usedNames, b.src, 'file', 'model', '.glb');
          lines.push(`[3D 模型](${href})`, '');
        }
        if (b.poster) {
          const href = pushMedia(media, usedNames, b.poster, 'image', 'image', '.png');
          lines.push(`![${escapeFeishuAlt('3D 预览')}](${href})`, '');
        }
        break;
      }
      case 'canvas': {
        for (const el of b.elements) {
          if (el.kind === 'text' || el.kind === 'sticky') {
            if (el.content?.trim()) lines.push(el.content, '');
          } else if (el.kind === 'image' && el.content) {
            const href = pushMedia(media, usedNames, el.content, 'image', 'image', '.png');
            lines.push(`![${escapeFeishuAlt('image.png')}](${href})`, '');
          } else if (el.kind === 'link' && el.linkUrl) {
            lines.push(el.linkUrl, '');
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { markdown, media };
}

/** @deprecated 使用 noteToFeishuMarkdown；保留别名 */
export function blocksToMarkdown(note: Pick<Note, 'title' | 'blocks'>): FeishuMarkdownExport {
  return noteToFeishuMarkdown(note);
}

export { FEISHU_MEDIA_DIR };
