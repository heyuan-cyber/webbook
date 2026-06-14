import type { NewsRegion } from './mergeNews';

export interface NewsItem {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  source?: string;
  region?: NewsRegion;
}

const REGION_LABEL: Record<NewsRegion, string> = {
  domestic: '国内',
  international: '国际',
};

export function formatNewsItemsForAi(items: NewsItem[]): string {
  if (!items.length) return '（无结果）';
  return items
    .map(
      (item, i) =>
        `${i + 1}. 标题: ${item.title}\n   URL: ${item.url}${
          item.snippet ? `\n   摘要: ${item.snippet}` : ''
        }${item.publishedAt ? `\n   时间: ${item.publishedAt}` : ''}${
          item.source ? `\n   渠道: ${item.source}` : ''
        }${item.region ? `\n   区域: ${REGION_LABEL[item.region]}` : ''}`,
    )
    .join('\n\n');
}
