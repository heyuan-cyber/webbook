/** AI 面板快捷指令：填入或一键发送 */
export interface AiQuickCommand {
  id: string;
  label: string;
  prompt: string;
}

export const AI_QUICK_COMMANDS: AiQuickCommand[] = [
  {
    id: 'expand',
    label: '扩写',
    prompt:
      '请根据当前笔记内容扩写，补充细节、例子与说明。用 # ## 标题和 - 列表排版，需要时用 [标题](url) 链接。',
  },
  {
    id: 'polish',
    label: '润色',
    prompt:
      '请润色当前笔记，改进文笔与结构但保持原意。用 # ## 标题和 - 列表排版输出完整修订稿。',
  },
  {
    id: 'outline',
    label: '列大纲',
    prompt:
      '请为当前笔记主题列一个清晰大纲（章节与要点），用 # ## 标题和 - 列表排版，可含 - [ ] 待办。',
  },
  {
    id: 'news',
    label: '今日新闻简报',
    prompt:
      '帮我全面整理今日新闻与热点：国内来源为主（约七成），国际要闻单独一节；按科技/财经/社会等分类，每条附真实链接与一句分析。',
  },
];
