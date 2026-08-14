/** 飞书客户端「下载为 Markdown」zip 中的媒体目录名 */
export const FEISHU_MEDIA_DIR = '图片和附件';

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)(\?.*)?$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i;

/** 解码 markdown 相对路径（含 %20）；去掉开头 ./ */
export function decodeFeishuMediaPath(raw: string): string {
  const trimmed = raw.trim().replace(/^\.\//, '');
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * 对齐飞书客户端下载：中文目录/文件名保持原文，仅编码空格等会破坏链接的 ASCII。
 * 例：`图片和附件/image 1.png` → `图片和附件/image%201.png`
 * （不要用 encodeURIComponent 整段，否则目录会变成 %E5%9B%BE…）
 */
export function encodeFeishuMediaPath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeFeishuPathSegment(seg))
    .join('/');
}

function encodeFeishuPathSegment(seg: string): string {
  let out = '';
  for (const ch of seg) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      ch === '-' ||
      ch === '_' ||
      ch === '.' ||
      ch === '~'
    ) {
      out += ch;
    } else if (code > 0x7f) {
      out += ch;
    } else if (ch === ' ') {
      out += '%20';
    } else {
      out += encodeURIComponent(ch);
    }
  }
  return out;
}

export function feishuMediaRelativePath(filename: string): string {
  const name = filename.replace(/^.*[/\\]/, '');
  return `${FEISHU_MEDIA_DIR}/${name}`;
}

export function isFeishuVideoPath(path: string): boolean {
  return VIDEO_EXT.test(decodeFeishuMediaPath(path));
}

export function isFeishuAudioPath(path: string): boolean {
  return AUDIO_EXT.test(decodeFeishuMediaPath(path));
}

export function isFeishuImagePath(path: string): boolean {
  return IMAGE_EXT.test(decodeFeishuMediaPath(path));
}

/** 从 zip 内任意路径判断是否落在「图片和附件」下 */
export function isUnderFeishuMediaDir(entryPath: string): boolean {
  const norm = entryPath.replace(/\\/g, '/');
  const parts = norm.split('/');
  return parts.includes(FEISHU_MEDIA_DIR);
}

/** 去掉飞书 alt 里常见的 `\.` / `\_` 转义 */
export function unescapeFeishuAlt(alt: string): string {
  return alt.replace(/\\(.)/g, '$1');
}

/** 飞书下载常见写法：`image\.png`、`foo\_bar\.gif` */
export function escapeFeishuAlt(alt: string): string {
  return alt.replace(/([\\_[\]().])/g, '\\$1');
}

/** 从资源 URL / 路径猜一个安全文件名 */
export function suggestMediaFilename(src: string, fallbackPrefix: string, ext: string): string {
  const withDot = ext.startsWith('.') ? ext : `.${ext}`;
  try {
    const u = src.includes('://') ? new URL(src) : null;
    const base = u ? u.pathname.split('/').pop() : src.split(/[/\\]/).pop();
    if (base && /\.[a-z0-9]+$/i.test(base)) {
      const name = sanitizeFilename(decodeURIComponent(base));
      // asset UUID 文件名对齐飞书习惯，改用 image / image 1 …
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(name)) {
        return `${fallbackPrefix}${withDot}`;
      }
      return name;
    }
  } catch {
    /* ignore */
  }
  return `${fallbackPrefix}${withDot}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"|?*\x00-\x1f]/g, '_').slice(0, 180) || 'file.bin';
}
