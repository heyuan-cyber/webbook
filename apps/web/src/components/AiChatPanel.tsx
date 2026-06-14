import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Block, Note } from '@webbook/shared';
import { markdownToBlocks, resolveAiDraft, looksLikeAiJsonBlob } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { AI_QUICK_COMMANDS } from '@/lib/aiQuickCommands';
import { toast } from '@/store/useToastStore';
import { BlockEditor } from './editor/BlockEditor';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  note: Note;
  disabled?: boolean;
  onApplyBlocks: (blocks: Block[], mode: 'replace' | 'append') => void;
}

export function AiChatPanel({ note, disabled, onApplyBlocks }: Props) {
  const { session, isGuest } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteMarkdown, setNoteMarkdown] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const previewBlocks = useMemo(
    () => (noteMarkdown ? markdownToBlocks(noteMarkdown) : []),
    [noteMarkdown],
  );

  useEffect(() => {
    setMessages([]);
    setDraft('');
    setNoteMarkdown(null);
  }, [note.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, noteMarkdown]);

  const locked = disabled || isGuest || !session?.token;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || locked) return;
    const nextUser: ChatMessage = { role: 'user', content: trimmed };
    const history = [...messages, nextUser];
    setMessages(history);
    setDraft('');
    setBusy(true);
    try {
      const apiResult = await apiClient.aiChat(note, history, session!.token);
      const resolved = resolveAiDraft(apiResult.reply, apiResult.noteMarkdown);
      setMessages((prev) => [...prev, { role: 'assistant', content: resolved.reply }]);
      setNoteMarkdown(resolved.noteMarkdown ?? null);
    } catch {
      toast('error', 'AI 请求失败，请检查登录与 API 配置');
      setMessages(messages);
      setDraft(trimmed);
    } finally {
      setBusy(false);
    }
  }

  function send() {
    void sendMessage(draft);
  }

  function runQuickCommand(prompt: string) {
    void sendMessage(prompt);
  }

  function applyDraft(mode: 'replace' | 'append') {
    if (!previewBlocks.length) {
      toast('error', '没有可应用的笔记草稿');
      return;
    }
    onApplyBlocks(previewBlocks, mode);
    setNoteMarkdown(null);
  }

  function applyFromReply(reply: string, mode: 'append' = 'append') {
    const resolved = resolveAiDraft(reply);
    const blocks = resolved.noteMarkdown ? markdownToBlocks(resolved.noteMarkdown) : [];
    if (!blocks.length) {
      if (looksLikeAiJsonBlob(reply)) {
        toast('error', 'AI 返回 JSON 无法解析，请重试生成');
        return;
      }
      const fallback = markdownToBlocks(reply);
      if (fallback.length) {
        onApplyBlocks(fallback, mode);
        return;
      }
      toast('error', '无法解析为结构化笔记，请重试或让 AI 用标题和列表排版');
      return;
    }
    onApplyBlocks(blocks, mode);
    setNoteMarkdown(null);
  }

  const hasDraft = Boolean(noteMarkdown && previewBlocks.length > 0);

  return (
    <section className={`ai-chat-panel ${collapsed ? 'collapsed' : ''}`} aria-label="AI 助手">
      <header className="ai-chat-head">
        <button
          type="button"
          className="ai-chat-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <span className="ai-chat-title">🤖 AI 助手</span>
          <span className="muted">{collapsed ? '展开' : '收起'}</span>
        </button>
      </header>

      {!collapsed && (
        <div className="ai-chat-body">
          {isGuest ? (
            <p className="ai-chat-hint muted">
              <Link to="/login">登录</Link> 后可使用 AI 辅助写作（不会自动修改笔记）。
            </p>
          ) : (
            <>
              <div className="ai-chat-messages" ref={scrollRef}>
                {messages.length === 0 && (
                  <p className="ai-chat-hint muted">
                    描述你想写什么，或点下方快捷指令。生成草稿后预览，再应用到笔记。
                  </p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`ai-chat-msg ai-chat-msg-${m.role}`}>
                    <span className="ai-chat-role">{m.role === 'user' ? '你' : 'AI'}</span>
                    <div className="ai-chat-bubble">{m.content}</div>
                    {m.role === 'assistant' &&
                      i === messages.length - 1 &&
                      !disabled &&
                      !hasDraft && (
                        <button
                          type="button"
                          className="btn btn-ghost ai-chat-insert"
                          onClick={() => applyFromReply(m.content)}
                        >
                          追加到笔记
                        </button>
                      )}
                  </div>
                ))}
                {busy && <p className="ai-chat-hint muted">AI 思考中…</p>}
              </div>

              {hasDraft && !disabled && (
                <div className="ai-chat-draft">
                  <div className="ai-chat-draft-head">
                    <strong>笔记草稿预览</strong>
                    <span className="muted">{previewBlocks.length} 个块</span>
                  </div>
                  <div className="ai-chat-draft-preview">
                    <BlockEditor blocks={previewBlocks} onChange={() => {}} readOnly />
                  </div>
                  <div className="ai-chat-draft-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => applyDraft('replace')}
                    >
                      替换笔记
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => applyDraft('append')}
                    >
                      追加到文末
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setNoteMarkdown(null)}
                    >
                      放弃草稿
                    </button>
                  </div>
                </div>
              )}

              {!locked && (
                <div className="ai-chat-quick" role="toolbar" aria-label="AI 快捷指令">
                  {AI_QUICK_COMMANDS.map((cmd) => (
                    <button
                      key={cmd.id}
                      type="button"
                      className="btn btn-ghost ai-chat-quick-btn"
                      disabled={busy}
                      title={cmd.prompt}
                      onClick={() => runQuickCommand(cmd.prompt)}
                    >
                      {cmd.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="ai-chat-compose">
                <textarea
                  className="ai-chat-input"
                  rows={2}
                  placeholder="让 AI 帮你从零搭建笔记…"
                  value={draft}
                  disabled={locked || busy}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={locked || busy || !draft.trim()}
                  onClick={send}
                >
                  发送
                </button>
              </div>
              {messages.some((m) => m.role === 'assistant') && !disabled && (
                <div className="ai-chat-foot muted">
                  {hasDraft
                    ? '草稿会拆成标题/列表/段落多块，确认后再写入笔记。'
                    : '若未出现预览，可点「追加到笔记」尝试解析回复内容。'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
