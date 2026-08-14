import JSZip from 'jszip';
import {
  FEISHU_MEDIA_DIR,
  decodeFeishuMediaPath,
  defaultCardSize,
  markdownToBlocks,
  noteToFeishuMarkdown,
  type Block,
  type Note,
} from '@webbook/shared';
import { assetUrl } from '@/lib/api';
import { handleImageFile } from '@/components/editor/imageUpload';

export type FeishuZipParseResult = {
  markdown: string;
  /** 原始文件名（无扩展）作标题候选 */
  titleHint: string;
  mediaFiles: { relativePath: string; blob: Blob; filename: string }[];
  warnings: string[];
};

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function basenameOf(path: string): string {
  const n = normalizeZipPath(decodeFeishuMediaPath(path));
  return n.split('/').pop() || n;
}

function mimeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
  };
  return map[ext] || 'application/octet-stream';
}

/** 去掉 zip 里单层包裹目录前缀，便于找到 md 与媒体夹 */
function stripCommonRoot(paths: string[]): Map<string, string> {
  const norms = paths.map(normalizeZipPath).filter((p) => !p.endsWith('/'));
  if (norms.length === 0) return new Map();
  const firstSegs = norms.map((p) => p.split('/')[0]);
  const root = firstSegs[0];
  const allSameRoot =
    Boolean(root) &&
    firstSegs.every((s) => s === root) &&
    norms.every((p) => p.includes('/'));
  const map = new Map<string, string>();
  for (const p of norms) {
    const logical = allSameRoot ? p.slice(root.length + 1) : p;
    map.set(p, logical);
  }
  return map;
}

export async function parseFeishuMarkdownZip(file: File | Blob): Promise<FeishuZipParseResult> {
  const zip = await JSZip.loadAsync(file);
  const entryNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const logicalOf = stripCommonRoot(entryNames);

  let mdPath: string | null = null;
  let mdLogical = '';
  for (const [physical, logical] of logicalOf) {
    if (logical.toLowerCase().endsWith('.md') && !logical.includes('/')) {
      mdPath = physical;
      mdLogical = logical;
      break;
    }
  }
  if (!mdPath) {
    for (const [physical, logical] of logicalOf) {
      if (logical.toLowerCase().endsWith('.md')) {
        mdPath = physical;
        mdLogical = logical;
        break;
      }
    }
  }
  if (!mdPath) throw new Error('zip 中未找到 Markdown 文件');

  const markdown = await zip.files[mdPath].async('string');
  const titleHint = mdLogical.replace(/\.md$/i, '').split('/').pop() || '导入笔记';

  const mediaFiles: FeishuZipParseResult['mediaFiles'] = [];
  const warnings: string[] = [];

  for (const [physical, logical] of logicalOf) {
    const parts = logical.split('/');
    const mediaIdx = parts.findIndex((p) => p === FEISHU_MEDIA_DIR || p.toLowerCase() === 'images');
    // 飞书客户端固定「图片和附件」；兼容偶发英文名
    const idx =
      mediaIdx >= 0
        ? mediaIdx
        : parts.findIndex((p) => p.includes('图片') && p.includes('附件'));
    if (idx < 0) continue;
    const filename = parts.slice(idx + 1).join('/');
    if (!filename) continue;
    const blob = await zip.files[physical].async('blob');
    const relativePath = `${FEISHU_MEDIA_DIR}/${filename}`;
    mediaFiles.push({ relativePath, blob, filename: basenameOf(filename) });
  }

  if (mediaFiles.length === 0) {
    warnings.push(`未在 zip 中找到「${FEISHU_MEDIA_DIR}」媒体目录`);
  }

  return { markdown, titleHint, mediaFiles, warnings };
}

/** 将上传后的 URL 登记到多种键，便于 md / block.src 匹配 */
function registerMediaUrl(
  urlByKey: Map<string, string>,
  relativePath: string,
  filename: string,
  url: string,
) {
  const decoded = decodeFeishuMediaPath(relativePath);
  const base = basenameOf(filename || relativePath);
  const keys = [
    relativePath,
    decoded,
    normalizeZipPath(relativePath),
    normalizeZipPath(decoded),
    `${FEISHU_MEDIA_DIR}/${base}`,
    base,
    base.toLowerCase(),
  ];
  for (const k of keys) {
    if (k) urlByKey.set(k, url);
  }
}

function lookupMediaUrl(urlByKey: Map<string, string>, rawSrc: string): string | undefined {
  if (!rawSrc) return undefined;
  if (
    rawSrc.startsWith('/api/') ||
    rawSrc.startsWith('data:') ||
    /^https?:\/\//i.test(rawSrc)
  ) {
    return rawSrc;
  }
  const decoded = decodeFeishuMediaPath(rawSrc);
  const base = basenameOf(decoded);
  return (
    urlByKey.get(rawSrc) ||
    urlByKey.get(decoded) ||
    urlByKey.get(normalizeZipPath(decoded)) ||
    urlByKey.get(`${FEISHU_MEDIA_DIR}/${base}`) ||
    urlByKey.get(base) ||
    urlByKey.get(base.toLowerCase()) ||
    [...urlByKey.entries()].find(([k]) => k.toLowerCase().endsWith(base.toLowerCase()))?.[1]
  );
}

/** 解析块上残留的相对路径 → 已上传 URL；失败则记警告 */
function applyMediaUrlsToBlocks(
  blocks: Block[],
  urlByKey: Map<string, string>,
  warnings: string[],
): Block[] {
  return blocks.map((b) => {
    if (b.type === 'image' || b.type === 'video' || b.type === 'audio' || b.type === 'model3d') {
      const resolved = lookupMediaUrl(urlByKey, b.src);
      if (resolved && resolved !== b.src) {
        const alt =
          b.type === 'image' && (b.alt === 'image.png' || b.alt === 'image.jpg')
            ? basenameOf(b.src)
            : b.type === 'image'
              ? b.alt
              : undefined;
        if (b.type === 'image') return { ...b, src: resolved, alt };
        if (b.type === 'video') return { ...b, src: resolved };
        if (b.type === 'audio') return { ...b, src: resolved };
        return { ...b, src: resolved };
      }
      if (b.src && !b.src.startsWith('/api/') && !b.src.startsWith('data:') && !/^https?:/i.test(b.src)) {
        warnings.push(`无法解析媒体路径：${b.src}`);
      }
    }
    return b;
  });
}

/** 导入舞台：图/视频最长边上限（世界坐标） */
const IMPORT_MEDIA_MAX_EDGE = 560;

function fitImportMediaSize(
  naturalW: number,
  naturalH: number,
  fallbackType: 'image' | 'video',
): { width: number; height: number } {
  if (!naturalW || !naturalH) return defaultCardSize(fallbackType);
  const scale = Math.min(1, IMPORT_MEDIA_MAX_EDGE / Math.max(naturalW, naturalH));
  return {
    width: Math.max(200, Math.round(naturalW * scale)),
    height: Math.max(150, Math.round(naturalH * scale)),
  };
}

function loadImageNaturalSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = assetUrl(src);
  });
}

function loadVideoNaturalSize(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const w = v.videoWidth;
      const h = v.videoHeight;
      v.src = '';
      resolve(w && h ? { w, h } : null);
    };
    v.onerror = () => resolve(null);
    v.src = assetUrl(src);
  });
}

/** 导入结果铺成 absolute 舞台卡；图/视频按自然尺寸缩放后再竖排 */
async function toAbsoluteStageBlocks(blocks: Block[]): Promise<Block[]> {
  const sized = await Promise.all(
    blocks.map(async (b) => {
      const fallback = defaultCardSize(b.type);
      let width = fallback.width;
      let height = fallback.height;
      if (b.type === 'image' && b.src) {
        const nat = await loadImageNaturalSize(b.src);
        if (nat) {
          const s = fitImportMediaSize(nat.w, nat.h, 'image');
          width = s.width;
          height = s.height;
        }
      } else if (b.type === 'video' && b.src) {
        const nat = await loadVideoNaturalSize(b.src);
        if (nat) {
          const s = fitImportMediaSize(nat.w, nat.h, 'video');
          width = s.width;
          height = s.height;
        }
      }
      return { block: b, width, height };
    }),
  );

  let y = -120;
  const gap = 28;
  return sized.map(({ block: b, width, height }, i) => {
    const next: Block = {
      ...b,
      placement: {
        mode: 'absolute',
        x: -Math.round(width / 2),
        y,
        z: i + 1,
        width,
        height,
        autoSize: b.type === 'paragraph' || b.type === 'heading' || b.type === 'sticky',
      },
    };
    y += height + gap;
    return next;
  });
}

export type ImportFeishuZipOptions = {
  session: { token: string } | null;
  isGuest: boolean;
};

export async function importBlocksFromFeishuZip(
  file: File,
  opts: ImportFeishuZipOptions,
): Promise<{ title: string; blocks: Block[]; warnings: string[] }> {
  const parsed = await parseFeishuMarkdownZip(file);
  const urlByKey = new Map<string, string>();
  const warnings = [...parsed.warnings];

  for (const m of parsed.mediaFiles) {
    try {
      const mime = m.blob.type && m.blob.type !== 'application/octet-stream'
        ? m.blob.type
        : mimeFromFilename(m.filename);
      const f = new File([m.blob], m.filename, { type: mime });
      const url = await handleImageFile(f, opts.session, opts.isGuest);
      registerMediaUrl(urlByKey, m.relativePath, m.filename, url);
    } catch (e) {
      const reason = e instanceof Error && e.message ? e.message : 'unknown';
      warnings.push(`未能上传媒体：${m.filename}（${reason}）`);
    }
  }

  const refRe = /!\[[^\]]*\]\(([^)]+)\)|\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = refRe.exec(parsed.markdown))) {
    const raw = match[1] || match[2];
    if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('data:')) continue;
    const decoded = decodeFeishuMediaPath(raw);
    if (!decoded.includes(FEISHU_MEDIA_DIR) && !basenameOf(decoded).match(/\.\w+$/)) continue;
    if (!lookupMediaUrl(urlByKey, decoded)) {
      warnings.push(`缺少媒体文件：${decoded}`);
    }
  }

  // 先按相对路径识别图/视频块，再替换 src（避免 data:/api URL 破坏扩展名判定）
  let blocks = markdownToBlocks(parsed.markdown);
  blocks = applyMediaUrlsToBlocks(blocks, urlByKey, warnings);

  if (
    blocks[0]?.type === 'heading' &&
    blocks[0].level === 1 &&
    blocks[0].text.trim() === parsed.titleHint.trim()
  ) {
    blocks = blocks.slice(1);
  }
  if (blocks.length === 0) {
    blocks = [{ id: `blk-${Date.now().toString(36)}`, type: 'paragraph', text: '' }];
  }

  blocks = await toAbsoluteStageBlocks(blocks);
  return { title: parsed.titleHint, blocks, warnings };
}

export async function buildFeishuMarkdownZip(note: Note): Promise<Blob> {
  const { markdown, media } = noteToFeishuMarkdown(note);
  const zip = new JSZip();
  const safeTitle = (note.title || 'note').replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);
  zip.file(`${safeTitle}.md`, markdown);
  const folder = zip.folder(FEISHU_MEDIA_DIR);
  if (!folder) throw new Error('无法创建媒体目录');

  for (const m of media) {
    const filename = m.relativePath.split('/').pop()!;
    try {
      const res = await fetch(assetUrl(m.src));
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      folder.file(filename, buf);
    } catch {
      /* skip missing */
    }
  }
  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 供导出飞书 API：序列化 md + 拉取媒体 File */
export async function collectFeishuExportPayload(note: Note): Promise<{
  title: string;
  markdown: string;
  files: { relativePath: string; file: File }[];
}> {
  const { markdown, media } = noteToFeishuMarkdown(note);
  const files: { relativePath: string; file: File }[] = [];
  for (const m of media) {
    try {
      const res = await fetch(assetUrl(m.src));
      if (!res.ok) continue;
      const blob = await res.blob();
      const filename = m.relativePath.split('/').pop()!;
      files.push({
        relativePath: m.relativePath,
        file: new File([blob], filename, { type: blob.type || 'application/octet-stream' }),
      });
    } catch {
      /* skip */
    }
  }
  return { title: note.title || '未命名笔记', markdown, files };
}
