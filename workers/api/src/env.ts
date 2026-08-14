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
  /** 与前端 VITE_ADMIN_EMAIL 一致；匹配登录邮箱即视为 admin（无需 Supabase metadata） */
  ADMIN_EMAIL?: string;
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

  /** Workers AI binding（wrangler.toml `[ai]`） */
  AI?: {
    run: (model: string, inputs: Record<string, unknown>) => Promise<unknown>;
  };
  /** 无 AI binding 时用 REST 调用 Workers AI */
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  /** 火山引擎（Seedance / Seedream） */
  VOLC_ACCESS_KEY_ID?: string;
  VOLC_SECRET_ACCESS_KEY?: string;
  VOLC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  TRIPO_API_KEY?: string;
  KLING_API_KEY?: string;
  /** 飞书开放平台（User OAuth 导出文档） */
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_REDIRECT_URI?: string;
}
