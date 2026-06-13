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
}
