/**
 * 双机 / clone 后零配置默认（仅公开面）。
 * 机密（GITHUB_TOKEN、FEISHU_APP_SECRET、service role 等）只住线上 Worker，不进仓库。
 * 可用 `.env` 的 VITE_* 覆盖（例如本机 wrangler：VITE_API_BASE_URL=http://localhost:8787）。
 */
export const DEFAULT_API_BASE_URL =
  'https://webbook-api.1060707057.workers.dev';

export const DEFAULT_SUPABASE_URL =
  'https://sfetitwfmnutiweqyfnq.supabase.co';

/** Supabase anon key（SPA 公开；RLS 保护数据） */
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZXRpdHdmbW51dGl3ZXF5Zm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMjQzMzMsImV4cCI6MjA5NjkwMDMzM30.UYfQSLI6Y092yPOabxgo-uqak9rk_r-tlNGQAlbpLWU';

export const DEFAULT_ADMIN_EMAIL = '1060707057@qq.com';
