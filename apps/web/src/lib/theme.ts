import { useEffect, useSyncExternalStore } from 'react';
import {
  DEFAULT_THEME,
  themeState,
  type ThemeSkin,
} from '@/lib/storage';

/**
 * 页面皮肤（主题色）运行时。
 *
 * 三套皮肤：gold（墨金，默认）/ paper（纸墨）/ blueprint（蓝图），
 * 颜色定义在 `styles/theme.css` 的 `[data-theme=...]` 下。
 *
 * 这里只负责：把当前皮肤写到 `document.documentElement.dataset.theme`
 * （并同步 `color-scheme`，让滚动条与原生控件跟着变），以及订阅变更。
 *
 * 首屏防闪：`index.html` 里有一段同步脚本，在 CSS 加载前先设好 data-theme；
 * 本模块在 React 挂载后再读一次，保证一致。
 */

const listeners = new Set<() => void>();
let current: ThemeSkin | null = null;

function read(): ThemeSkin {
  if (current === null) current = themeState.load();
  return current;
}

/** 与 index.html 首屏脚本共用：皮肤 → 浏览器 UI 底色 */
const THEME_COLOR: Record<ThemeSkin, string> = {
  gold: '#14161a',
  paper: '#f4f1ea',
  blueprint: '#0e1114',
};

function apply(skin: ThemeSkin): void {
  const root = document.documentElement;
  root.dataset.theme = skin;
  // color-scheme 与皮肤一致：dark 皮肤下原生 select / 滚动条走暗色
  root.style.colorScheme = skin === 'paper' ? 'light' : 'dark';
  // 移动端地址栏 / PWA 状态栏底色跟着皮肤走
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[skin]);
}

export function setTheme(skin: ThemeSkin): void {
  if (read() === skin) return;
  current = skin;
  themeState.save(skin);
  apply(skin);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemeSkin {
  return read();
}

/** 读取当前皮肤（组件用），返回 [skin, setSkin] */
export function useTheme(): [ThemeSkin, (skin: ThemeSkin) => void] {
  const skin = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_THEME);
  return [skin, setTheme];
}

/** 应用外壳挂载时调用一次：确保 DOM 与持久化状态一致 */
export function useThemeSync(): void {
  useEffect(() => {
    apply(read());
  }, []);
}

export const THEME_META: { skin: ThemeSkin; label: string; hint: string; swatch: string[] }[] = [
  {
    skin: 'gold',
    label: '墨金',
    hint: '暖石墨 + 金 · 默认',
    swatch: ['#14161a', '#1f232a', '#c4a574', '#eae6df'],
  },
  {
    skin: 'paper',
    label: '纸墨',
    hint: '纸白 + 朱砂 · 适合白天',
    swatch: ['#f4f1ea', '#ffffff', '#a8442a', '#1b1a17'],
  },
  {
    skin: 'blueprint',
    label: '蓝图',
    hint: '冷石墨 + 青 · 工程感',
    swatch: ['#0e1114', '#171c22', '#35d0ba', '#dfe5ea'],
  },
];
