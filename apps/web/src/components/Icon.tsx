/**
 * WebBook 图标 sprite（方向一 · 墨金）
 *
 * 设计约定（对应 `docs/design/UI-REFRESH-AUDIT.md` 第 4 节）：
 *   - 24×24 viewBox，线性描边，`stroke-width: 1.7`，圆角线帽/接头
 *   - 颜色一律 `currentColor`，所以图标跟随文字色与主题
 *   - 尺寸通过 `.i-*` 类控制（12/14/16/18/20/24/32），不再靠 font-size 被动缩放
 *
 * 用法：
 *   import { Icon } from '@/components/Icon';
 *   <Icon name="folder" />                       // 16px 默认
 *   <Icon name="plus" size={14} />               // 指定尺寸
 *   <Icon name="trash" label="删除" />            // 独立语义图标，带无障碍名
 *
 * 装饰性图标默认 `aria-hidden`（不朗读）；只有需要独立语义时才传 `label`。
 */

export const ICON_NAMES = [
  'book',
  'folder',
  'folder-open',
  'file',
  'plus',
  'x',
  'pencil',
  'trash',
  'check',
  'check-square',
  'square',
  'chevron-right',
  'chevron-down',
  'chevron-left',
  'chevron-up',
  'search',
  'command',
  'list-tree',
  'clock',
  'user',
  'users',
  'logout',
  'settings',
  'link',
  'image',
  'send',
  'sparkles',
  'grip',
  'alert',
  'info',
  'layers',
  'globe',
  'lock',
  'arrow-right',
  'arrow-left',
  'arrow-up',
  'arrow-down',
  'external',
  'zoom-in',
  'zoom-out',
  'refresh',
  'download',
  'quote',
  'volume',
  'box',
  'play',
  'pin',
  'minus',
  'type',
  'hash',
  'list',
  'calendar',
  'eye',
  'slash',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** 图标路径数据：只存 `d`，配合 <svg> 的描边属性渲染 */
const PATHS: Record<IconName, string[]> = {
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  'folder-open': [
    'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1',
    'M3 9h18l-2.2 8.4A2 2 0 0 1 16.9 19H5a2 2 0 0 1-2-2z',
  ],
  file: ['M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z', 'M14 2v5h5'],
  plus: ['M12 5v14M5 12h14'],
  x: ['M18 6 6 18M6 6l12 12'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  trash: ['M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
  check: ['M20 6 9 17l-5-5'],
  'check-square': ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M8.5 12.5l2.5 2.5 4.5-5'],
  square: ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.6-3.6'],
  command: ['M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z'],
  'list-tree': ['M9 6h11M9 12h11M9 18h11', 'M4 4v14a2 2 0 0 0 2 2h1'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3.5 2'],
  user: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21a8 8 0 0 1 16 0'],
  users: ['M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 5.2a3.5 3.5 0 0 1 0 6.6M18 20a6.6 6.6 0 0 0-1.6-4.3'],
  logout: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l-5-5 5-5M5 12h11'],
  settings: [
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z',
  ],
  link: [
    'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1',
    'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  ],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 10.6A1.6 1.6 0 1 0 9 7.4a1.6 1.6 0 0 0 0 3.2z', 'M21 16l-5-5-6 6-3-3-4 4'],
  send: ['M4 12l16-8-6 16-3-7z'],
  sparkles: [
    'M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z',
    'M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  ],
  grip: [
    'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  ],
  alert: ['M12 3l9 16H3z', 'M12 9v5M12 17.2v.2'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5M12 7.8v.2'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  globe: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z'],
  lock: ['M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  'arrow-right': ['M5 12h13M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H6M11 6l-6 6 6 6'],
  'arrow-up': ['M12 19V6M6 11l6-6 6 6'],
  'arrow-down': ['M12 5v13M6 13l6 6 6-6'],
  external: ['M14 4h6v6M20 4l-9 9', 'M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5'],
  'zoom-in': ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.6-3.6M11 8.5v5M8.5 11h5'],
  'zoom-out': ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.6-3.6M8.5 11h5'],
  refresh: ['M20 11a8 8 0 0 0-13.7-5.2L3 9', 'M3 4v5h5', 'M4 13a8 8 0 0 0 13.7 5.2L21 15', 'M21 20v-5h-5'],
  download: ['M12 3v12M7 11l5 5 5-5M4 20h16'],
  quote: [
    'M9 6a4 4 0 0 0-4 4v8h6v-6H7.5A1.5 1.5 0 0 1 9 10.5z',
    'M19 6a4 4 0 0 0-4 4v8h6v-6h-3.5A1.5 1.5 0 0 1 19 10.5z',
  ],
  volume: ['M11 5 6.5 9H3v6h3.5L11 19z', 'M15.5 8.5a5 5 0 0 1 0 7'],
  box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5 8-4.5M12 12v9'],
  play: ['M8 5.5v13l11-6.5z'],
  pin: ['M12 16v5', 'M9 3h6l-.8 4.2 2.3 2.8H7.5l2.3-2.8z'],
  minus: ['M5 12h14'],
  type: ['M5 6V4h14v2', 'M12 4v16M9 20h6'],
  hash: ['M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16'],
  list: ['M8 6h13M8 12h13M8 18h13', 'M3.5 6h.01M3.5 12h.01M3.5 18h.01'],
  calendar: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M8 3v4M16 3v4M3 11h18'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  slash: ['M17 3L7 21'],
};

/** 允许的尺寸，对应 design-system.css 的 `.i-*` 类 */
export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 32;

export interface IconProps {
  name: IconName;
  /** 像素尺寸，默认 16 */
  size?: IconSize;
  /**
   * 无障碍名。传了就表示这是有独立语义的图标（会加 role="img" + aria-label）；
   * 不传则按装饰处理（aria-hidden），由父级按钮提供 aria-label。
   */
  label?: string;
  className?: string;
}

export function Icon({ name, size = 16, label, className }: IconProps) {
  const paths = PATHS[name];
  if (!paths) return null;

  const cls = ['i', size === 16 ? '' : `i-${size}`, className].filter(Boolean).join(' ');

  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
