import { useLayoutEffect, useRef, type RefObject } from 'react';
import { AUTO_SIZE_MAX_WIDTH } from '@webbook/shared';

interface Options {
  enabled: boolean;
  rootRef: RefObject<HTMLElement | null>;
  minWidth: number;
  minHeight: number;
  currentWidth: number;
  currentHeight: number;
  /** 纯文本内容（按 \\n 分行测最长行） */
  contentKey: string;
  /** 拖拽/缩放进行中时跳过 */
  isBusy: () => boolean;
  onSize: (size: { width: number; height: number }) => void;
}

function horizontalChrome(root: HTMLElement): number {
  const rootCs = getComputedStyle(root);
  let pad =
    (parseFloat(rootCs.paddingLeft) || 0) + (parseFloat(rootCs.paddingRight) || 0);
  const body = root.querySelector('.stage-card-body') as HTMLElement | null;
  if (body) {
    const b = getComputedStyle(body);
    pad += (parseFloat(b.paddingLeft) || 0) + (parseFloat(b.paddingRight) || 0);
  }
  // 边框 + 余量（滚动条/字距）
  pad +=
    (parseFloat(rootCs.borderLeftWidth) || 0) +
    (parseFloat(rootCs.borderRightWidth) || 0) +
    8;
  return pad;
}

/** 用隐藏探针按最长逻辑行测内容宽 */
function measureLongestLineWidth(root: HTMLElement, text: string): number {
  const sample =
    (root.querySelector(
      'textarea, .md-field-preview, .sticky-text, .stage-card-input',
    ) as HTMLElement | null) ?? root;
  const cs = getComputedStyle(sample);
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    'white-space:pre',
    'width:max-content',
    'max-width:none',
    `font:${cs.font}`,
    `letter-spacing:${cs.letterSpacing}`,
    `padding:0`,
    'margin:0',
    'border:none',
  ].join(';');
  document.body.appendChild(probe);

  let maxLine = 0;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    probe.textContent = line.length ? line : ' ';
    maxLine = Math.max(maxLine, probe.getBoundingClientRect().width);
  }
  document.body.removeChild(probe);
  return Math.ceil(maxLine + horizontalChrome(root));
}

/** autoSize：先按最长行定宽，再在该宽度下量高 */
export function useAutoSizeHeight({
  enabled,
  rootRef,
  minWidth,
  minHeight,
  currentWidth,
  currentHeight,
  contentKey,
  isBusy,
  onSize,
}: Options) {
  const onSizeRef = useRef(onSize);
  onSizeRef.current = onSize;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  const lastApplied = useRef({ w: currentWidth, h: currentHeight });
  const minWRef = useRef(minWidth);
  const minHRef = useRef(minHeight);
  minWRef.current = minWidth;
  minHRef.current = minHeight;

  useLayoutEffect(() => {
    lastApplied.current = { w: currentWidth, h: currentHeight };
  }, [currentWidth, currentHeight]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = rootRef.current;
    if (!el) return;

    let raf = 0;

    const measure = () => {
      if (isBusyRef.current()) return;

      const naturalW = measureLongestLineWidth(el, contentKey);
      const nextW = Math.min(
        AUTO_SIZE_MAX_WIDTH,
        Math.max(minWRef.current, naturalW || minWRef.current),
      );

      const prevW = el.style.width;
      const prevH = el.style.height;
      const prevMaxH = el.style.maxHeight;
      el.style.width = `${nextW}px`;
      el.style.height = 'auto';
      el.style.maxHeight = 'none';
      const naturalH = Math.ceil(el.getBoundingClientRect().height);
      el.style.width = prevW;
      el.style.height = prevH;
      el.style.maxHeight = prevMaxH;

      // 高度不封顶；minH 已含当前 placement，避免空大卡被缩回
      const nextH = Math.max(minHRef.current, naturalH || minHRef.current);

      const last = lastApplied.current;
      if (Math.abs(nextW - last.w) > 1 || Math.abs(nextH - last.h) > 1) {
        lastApplied.current = { w: nextW, h: nextH };
        onSizeRef.current({ width: nextW, height: nextH });
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const inner = el.querySelector('.stage-card-body, .md-field');
    if (inner) ro.observe(inner);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [enabled, contentKey, rootRef]);
}
