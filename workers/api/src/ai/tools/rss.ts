import type { Env } from '../../env';
import type { NewsItem } from './types';
import type { NewsRegion } from './mergeNews';

function pickTag(block: string, tag: string): string | undefined {
  const cdata = block.match(
    new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i'),
  );
  if (cdata?.[1]) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
  return plain?.[1]?.trim() || undefined;
}

function pickLink(block: string): string | undefined {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom?.[1] && !atom[0].includes('rel="self"')) return atom[1].trim();
  const rssLink = pickTag(block, 'link');
  if (rssLink?.startsWith('http')) return rssLink;
  const guid = pickTag(block, 'guid');
  if (guid?.startsWith('http')) return guid;
  return undefined;
}

function parseFeedXml(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = [
    ...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/gi),
  ];

  for (const match of blocks) {
    const block = match[1];
    const title = pickTag(block, 'title');
    const url = pickLink(block);
    if (!title || !url) continue;
    items.push({
      title,
      url,
      snippet: pickTag(block, 'description') ?? pickTag(block, 'summary') ?? pickTag(block, 'content'),
      publishedAt: pickTag(block, 'pubDate') ?? pickTag(block, 'published') ?? pickTag(block, 'updated'),
      source,
    });
  }
  return items;
}

function todayInShanghai(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function isToday(pubDate: string | undefined): boolean {
  if (!pubDate) return true;
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return true;
  const itemDay = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  return itemDay === todayInShanghai();
}

function splitFeeds(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseFeedUrls(env: Env, region: NewsRegion): string[] {
  if (region === 'domestic') {
    const domestic = env.RSS_FEEDS_DOMESTIC ?? env.RSS_FEEDS ?? '';
    return splitFeeds(domestic);
  }
  return splitFeeds(env.RSS_FEEDS_INTERNATIONAL ?? '');
}

export function hasRssFeeds(env: Env): boolean {
  return parseFeedUrls(env, 'domestic').length > 0 || parseFeedUrls(env, 'international').length > 0;
}

/** 拉取配置的 RSS 源，默认只保留今日条目 */
export async function fetchRssFeeds(
  env: Env,
  opts: { maxItems?: number; todayOnly?: boolean; region?: NewsRegion } = {},
): Promise<NewsItem[]> {
  const region = opts.region ?? 'domestic';
  const feeds = parseFeedUrls(env, region);
  if (!feeds.length) return [];

  const maxItems = Math.min(opts.maxItems ?? 20, 40);
  const todayOnly = opts.todayOnly !== false;
  const merged: NewsItem[] = [];

  await Promise.all(
    feeds.map(async (feedUrl) => {
      try {
        const res = await fetch(feedUrl, {
          headers: { 'User-Agent': 'webbook-bot/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
        });
        if (!res.ok) return;
        const xml = await res.text();
        const source = new URL(feedUrl).hostname;
        let items = parseFeedXml(xml, source);
        if (todayOnly) items = items.filter((it) => isToday(it.publishedAt));
        merged.push(...items);
      } catch {
        // skip broken feed
      }
    }),
  );

  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of merged) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }

  return deduped.slice(0, maxItems);
}
