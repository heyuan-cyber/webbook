import { useEffect, useState } from 'react';
import type { Comment } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { avatarInitials, useGuestPersona } from '@/lib/guestPersona';
import { toast } from '@/store/useToastStore';

export function CommentSection({
  ownerId,
  noteId,
}: {
  ownerId: string;
  noteId: string;
}) {
  const { session, isGuest } = useAuth();
  const { persona, setDisplayName, rerollName } = useGuestPersona();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    void apiClient
      .loadComments(ownerId, noteId)
      .then((res) => setComments(res.comments))
      .catch(() => toast('error', '加载评论失败'))
      .finally(() => setLoading(false));
  }, [noteId, ownerId]);

  async function submit() {
    const text = body.trim();
    if (!text) return;

    setSubmitting(true);
    try {
      const comment = await apiClient.postComment(ownerId, noteId, {
        body: text,
        ...(isGuest && persona
          ? {
              author: {
                type: 'guest' as const,
                guestId: persona.guestId,
                displayName: persona.displayName.trim(),
                avatarHue: persona.avatarHue,
              },
            }
          : {}),
        token: session?.token,
      });
      setComments((prev) => [...prev, comment]);
      setBody('');
      toast('success', '评论已发表');
    } catch {
      toast('error', '发表评论失败');
    } finally {
      setSubmitting(false);
    }
  }

  const identityReady = !isGuest || persona;

  return (
    <section className="comment-section">
      <h2 className="comment-heading">
        评论 {comments.length > 0 && <span className="muted">({comments.length})</span>}
      </h2>

      {loading && <p className="muted">加载评论…</p>}
      {!loading && comments.length === 0 && (
        <p className="muted comment-empty">还没有评论，来抢沙发吧。</p>
      )}

      <ul className="comment-list">
        {comments.map((c) => (
          <li key={c.id} className="comment-item">
            <CommentAvatar
              name={c.author.displayName}
              hue={c.author.avatarHue ?? hashHue(c.author.displayName)}
              isGuest={c.author.type === 'guest'}
            />
            <div className="comment-body-wrap">
              <div className="comment-meta">
                <span className="comment-author">{c.author.displayName}</span>
                {c.author.type === 'guest' && (
                  <span className="comment-badge muted">游客</span>
                )}
                <time className="comment-time muted">{formatTime(c.createdAt)}</time>
              </div>
              <p className="comment-text">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="comment-form">
        <h3 className="comment-form-title">发表评论</h3>
        {isGuest && persona && (
          <div className="comment-identity">
            <CommentAvatar name={persona.displayName} hue={persona.avatarHue} isGuest />
            <label className="comment-nickname">
              <span className="muted">昵称</span>
              <input
                type="text"
                maxLength={32}
                value={persona.displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="你的昵称"
              />
            </label>
            <button type="button" className="btn btn-ghost" onClick={rerollName}>
              随机换一个
            </button>
          </div>
        )}
        {!isGuest && session && (
          <p className="comment-identity-logged muted">
            以 <strong>{session.email}</strong> 发表
          </p>
        )}
        <textarea
          className="comment-input"
          rows={3}
          maxLength={2000}
          placeholder="写下你的想法…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={!identityReady || submitting}
        />
        <div className="comment-form-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!identityReady || submitting || !body.trim()}
            onClick={() => void submit()}
          >
            {submitting ? '发表中…' : '发表评论'}
          </button>
        </div>
      </div>
    </section>
  );
}

function CommentAvatar({
  name,
  hue,
  isGuest,
}: {
  name: string;
  hue: number;
  isGuest?: boolean;
}) {
  return (
    <span
      className="comment-avatar"
      style={{ background: `hsl(${hue} 55% 42%)` }}
      title={isGuest ? '游客' : undefined}
      aria-hidden
    >
      {avatarInitials(name)}
    </span>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function hashHue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}
