export interface Env {
  // secrets
  GITHUB_TOKEN: string;
  AI_API_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // vars
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  AI_PROVIDER: string;
  AI_BASE_URL: string;
  AI_MODEL: string;
  SUPABASE_URL: string;
  /** 逗号分隔 RSS URL（兼容旧配置，等同国内源） */
  RSS_FEEDS?: string;
  /** 国内 RSS 源 */
  RSS_FEEDS_DOMESTIC?: string;
  /** 国际 RSS 源 */
  RSS_FEEDS_INTERNATIONAL?: string;
  /** 国内条目占比 0–1，默认 0.7 */
  DOMESTIC_NEWS_RATIO?: string;
  /** 国内搜索：bocha | serper | tavily */
  SEARCH_PROVIDER_DOMESTIC?: string;
  /** 国际搜索：tavily | serper */
  SEARCH_PROVIDER_INTERNATIONAL?: string;
  /** 兼容：未分区域时共用 */
  SEARCH_PROVIDER?: string;
  SEARCH_API_KEY?: string;
  SEARCH_API_KEY_DOMESTIC?: string;
  SEARCH_API_KEY_INTERNATIONAL?: string;
}
