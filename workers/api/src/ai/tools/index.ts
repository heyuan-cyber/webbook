import type { Env } from '../../env';
import { fetchRssFeeds, hasRssFeeds } from './rss';
import { webSearch, hasAnyWebSearch } from './webSearch';
import { researchTopic } from './research';
import { formatNewsItemsForAi } from './types';
import type { NewsRegion } from './mergeNews';

export { hasRssFeeds, hasAnyWebSearch as hasWebSearch };

export async function executeAiTool(
  env: Env,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'research_topic': {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return '（缺少 query 参数）';
      const maxItems = typeof args.max_items === 'number' ? args.max_items : 30;
      const items = await researchTopic(env, query, { maxItems });
      return formatNewsItemsForAi(items);
    }
    case 'fetch_rss_feeds': {
      const maxItems = typeof args.max_items === 'number' ? args.max_items : 20;
      const todayOnly = args.today_only !== false;
      const region =
        args.region === 'international' || args.region === 'domestic'
          ? (args.region as NewsRegion)
          : 'domestic';
      const items = await fetchRssFeeds(env, { maxItems, todayOnly, region });
      return formatNewsItemsForAi(items);
    }
    case 'web_search': {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return '（缺少 query 参数）';
      const maxResults = typeof args.max_results === 'number' ? args.max_results : 12;
      const region =
        args.region === 'international' || args.region === 'domestic'
          ? (args.region as NewsRegion)
          : 'domestic';
      const items = await webSearch(env, query, maxResults, region);
      return formatNewsItemsForAi(items);
    }
    default:
      return `未知工具: ${name}`;
  }
}

export function buildAiTools(env: Env) {
  const tools: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }[] = [];

  if (hasAnyWebSearch(env) || hasRssFeeds(env)) {
    tools.push({
      type: 'function',
      function: {
        name: 'research_topic',
        description:
          '全面检索某一主题：并行调用国内+国际搜索与 RSS（新闻类），国内来源约占七成，返回去重后的标题、URL、摘要。用户需要搜索、调研、查资料时优先使用本工具。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '检索主题或关键词，如「量子计算最新进展」「今日科技新闻」' },
            max_items: { type: 'number', description: '最多返回条数，默认 30' },
          },
          required: ['query'],
        },
      },
    });
  }

  if (hasRssFeeds(env)) {
    tools.push({
      type: 'function',
      function: {
        name: 'fetch_rss_feeds',
        description: '拉取已配置的 RSS 源（国内或国际），获取最新条目，返回真实标题与 URL。',
        parameters: {
          type: 'object',
          properties: {
            max_items: { type: 'number', description: '最多返回条数，默认 20' },
            today_only: { type: 'boolean', description: '是否只保留今日条目，默认 true' },
            region: {
              type: 'string',
              enum: ['domestic', 'international'],
              description: '国内或国际 RSS 源，默认 domestic',
            },
          },
        },
      },
    });
  }

  if (hasAnyWebSearch(env)) {
    tools.push({
      type: 'function',
      function: {
        name: 'web_search',
        description:
          '单次网页搜索。国内默认博查/Serper(中国区)，国际默认 Tavily。用于补充 research_topic 未覆盖的侧面或细分关键词。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            max_results: { type: 'number', description: '最多返回条数，默认 12' },
            region: {
              type: 'string',
              enum: ['domestic', 'international'],
              description: '搜索区域，默认 domestic',
            },
          },
          required: ['query'],
        },
      },
    });
  }

  return tools;
}

export function hasWebTools(env: Env): boolean {
  return buildAiTools(env).length > 0;
}

export function needsWebResearch(text: string): boolean {
  return /今日|今天|新闻|简报|资讯|热搜|最新|头条|报刊|发生了什么|搜索|查一下|查询|查一查|帮我找|帮我查|调研|了解|搜集|资料|近况|动态|是什么|怎么样|有哪些|介绍/i.test(
    text,
  );
}
