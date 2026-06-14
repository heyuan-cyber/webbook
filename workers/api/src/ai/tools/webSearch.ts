import type { Env } from '../../env';
import type { NewsItem } from './types';
import type { NewsRegion } from './mergeNews';

export function hasWebSearch(env: Env, region?: NewsRegion): boolean {
  if (region === 'international') {
    return Boolean(
      (env.SEARCH_API_KEY_INTERNATIONAL ?? env.SEARCH_API_KEY ?? '').trim(),
    );
  }
  if (region === 'domestic') {
    return Boolean((env.SEARCH_API_KEY_DOMESTIC ?? env.SEARCH_API_KEY ?? '').trim());
  }
  return hasWebSearch(env, 'domestic') || hasWebSearch(env, 'international');
}

export function hasAnyWebSearch(env: Env): boolean {
  return hasWebSearch(env, 'domestic') || hasWebSearch(env, 'international');
}

function providerForRegion(env: Env, region: NewsRegion): string {
  if (region === 'domestic') {
    return (env.SEARCH_PROVIDER_DOMESTIC ?? env.SEARCH_PROVIDER ?? 'bocha').toLowerCase();
  }
  return (env.SEARCH_PROVIDER_INTERNATIONAL ?? env.SEARCH_PROVIDER ?? 'tavily').toLowerCase();
}

function apiKeyForRegion(env: Env, region: NewsRegion): string | undefined {
  if (region === 'domestic') {
    return (env.SEARCH_API_KEY_DOMESTIC ?? env.SEARCH_API_KEY)?.trim();
  }
  return (env.SEARCH_API_KEY_INTERNATIONAL ?? env.SEARCH_API_KEY)?.trim();
}

async function bochaSearch(apiKey: string, query: string, maxResults: number): Promise<NewsItem[]> {
  const res = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      count: maxResults,
      summary: true,
      freshness: 'noLimit',
    }),
  });
  if (!res.ok) throw new Error(`Bocha error: ${res.status}`);
  const data = (await res.json()) as {
    data?: {
      webPages?: {
        value?: {
          name?: string;
          title?: string;
          url?: string;
          snippet?: string;
          summary?: string;
        }[];
      };
    };
    webPages?: {
      value?: {
        name?: string;
        title?: string;
        url?: string;
        snippet?: string;
        summary?: string;
      }[];
    };
  };
  const pages = data.data?.webPages?.value ?? data.webPages?.value ?? [];
  return pages
    .filter((r) => r.url)
    .map((r) => ({
      title: r.name ?? r.title ?? r.url!,
      url: r.url!,
      snippet: r.summary ?? r.snippet,
      source: 'bocha',
    }));
}

async function tavilySearch(apiKey: string, query: string, maxResults: number): Promise<NewsItem[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: 'advanced',
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`);
  const data = (await res.json()) as {
    results?: { title: string; url: string; content?: string }[];
  };
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: 'tavily',
  }));
}

async function serperSearch(
  apiKey: string,
  query: string,
  maxResults: number,
  region: NewsRegion,
): Promise<NewsItem[]> {
  const body: Record<string, unknown> = {
    q: query,
    num: maxResults,
  };
  if (region === 'domestic') {
    body.gl = 'cn';
    body.hl = 'zh-cn';
  }
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Serper error: ${res.status}`);
  const data = (await res.json()) as {
    organic?: { title: string; link: string; snippet?: string }[];
    news?: { title: string; link: string; snippet?: string; date?: string }[];
  };
  const rows = [...(data.news ?? []), ...(data.organic ?? [])];
  return rows.slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
    publishedAt: 'date' in r && typeof r.date === 'string' ? r.date : undefined,
    source: 'serper',
  }));
}

async function searchWithProvider(
  provider: string,
  apiKey: string,
  query: string,
  maxResults: number,
  region: NewsRegion,
): Promise<NewsItem[]> {
  if (provider === 'bocha') return bochaSearch(apiKey, query, maxResults);
  if (provider === 'serper') return serperSearch(apiKey, query, maxResults, region);
  return tavilySearch(apiKey, query, maxResults);
}

/** 调用第三方搜索 API；region 决定默认 provider 与区域偏置 */
export async function webSearch(
  env: Env,
  query: string,
  maxResults = 10,
  region: NewsRegion = 'domestic',
): Promise<NewsItem[]> {
  const apiKey = apiKeyForRegion(env, region);
  if (!apiKey) return [];

  const limit = Math.min(maxResults, 20);
  const provider = providerForRegion(env, region);
  return searchWithProvider(provider, apiKey, query, limit, region);
}
