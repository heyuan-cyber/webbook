import type { Env } from '../../env';
import { fetchRssFeeds } from './rss';
import { webSearch } from './webSearch';
import { mergeNewsByRatio, parseDomesticRatio, tagRegion } from './mergeNews';
import type { NewsItem } from './types';

function isNewsLikeQuery(query: string): boolean {
  return /新闻|简报|今日|今天|头条|热搜|资讯|报刊|早报|晚报|要闻/i.test(query);
}

/**
 * 多源聚合检索：国内搜索 + 国际搜索 +（新闻类）RSS，按国内比例合并。
 */
export async function researchTopic(
  env: Env,
  query: string,
  opts: { maxItems?: number } = {},
): Promise<NewsItem[]> {
  const q = query.trim();
  if (!q) return [];

  const maxItems = Math.min(opts.maxItems ?? 30, 40);
  const ratio = parseDomesticRatio(env);
  const newsLike = isNewsLikeQuery(q);

  const domesticSearchN = Math.min(16, Math.ceil(maxItems * 0.5));
  const intlSearchN = Math.min(10, Math.ceil(maxItems * 0.3));

  const [domSearch, intlSearch, domRss, intlRss] = await Promise.all([
    webSearch(env, q, domesticSearchN, 'domestic').catch(() => []),
    webSearch(env, q, intlSearchN, 'international').catch(() => []),
    newsLike
      ? fetchRssFeeds(env, { region: 'domestic', maxItems: 14, todayOnly: true }).catch(() => [])
      : Promise.resolve([]),
    newsLike
      ? fetchRssFeeds(env, { region: 'international', maxItems: 8, todayOnly: true }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const domestic = [
    ...tagRegion(domSearch, 'domestic'),
    ...tagRegion(domRss, 'domestic'),
  ];
  const international = [
    ...tagRegion(intlSearch, 'international'),
    ...tagRegion(intlRss, 'international'),
  ];

  return mergeNewsByRatio(domestic, international, { maxItems, domesticRatio: ratio });
}
