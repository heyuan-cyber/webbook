export interface SystemSettings {
  schemaVersion: number;
  githubRepo: string;
  githubBranch: string;
  aiProvider: string;
  aiBaseUrl: string;
  aiModel: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  schemaVersion: 1,
  githubRepo: '',
  githubBranch: 'main',
  aiProvider: 'deepseek',
  aiBaseUrl: 'https://api.deepseek.com',
  aiModel: 'deepseek-chat',
};
