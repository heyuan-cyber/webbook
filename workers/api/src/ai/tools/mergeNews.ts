import type { NewsItem } from './types';

export type NewsRegion = 'domestic' | 'international';

export function tagRegion(items: NewsItem[], region: NewsRegion): NewsItem[] {
  return items.map((item) => ({ ...item, region }));
}

/** 按国内比例合并多路结果，国内条目优先，按 URL 去重 */
export function mergeNewsByRatio(
  domestic: NewsItem[],
  international: NewsItem[],
  opts: { maxItems: number; domesticRatio?: number },
): NewsItem[] {
  const ratio = Math.min(1, Math.max(0, opts.domesticRatio ?? 0.7));
  const maxItems = Math.max(1, opts.maxItems);
  const domesticTarget = Math.ceil(maxItems * ratio);
  const intlTarget = maxItems - domesticTarget;

  const seen = new Set<string>();
  const out: NewsItem[] = [];

  function take(pool: NewsItem[], limit: number) {
    for (const item of pool) {
      if (out.length >= maxItems || limit <= 0) break;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
      limit -= 1;
    }
  }

  take(domestic, domesticTarget);
  take(international, intlTarget);
  // 若某侧不足，用另一侧补足
  take(domestic, maxItems - out.length);
  take(international, maxItems - out.length);

  return out.slice(0, maxItems);
}

export function parseDomesticRatio(env: { DOMESTIC_NEWS_RATIO?: string }): number {
  const n = Number.parseFloat(env.DOMESTIC_NEWS_RATIO ?? '0.7');
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.7;
}
