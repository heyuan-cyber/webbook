import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Note } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { blogHubPath } from '@/lib/blog';

export function CircleBlogPostPage() {
  const { circleId, ownerId, noteId } = useParams();
  const { session, isGuest } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isGuest || !session?.token) {
      navigate('/login');
      return;
    }
    if (!circleId || !ownerId || !noteId) return;
    setLoading(true);
    void apiClient
      .loadCircleMemberBlogNote(circleId, ownerId, noteId, session.token)
      .then((res) => {
        setNote(res.note);
        setOwnerEmail(res.ownerEmail);
      })
      .catch(() => setError('文章不存在或无权阅读'))
      .finally(() => setLoading(false));
  }, [circleId, ownerId, noteId, session?.token, isGuest, navigate]);

  return (
    <div className="blog-shell">
      <header className="blog-header">
        <div className="blog-header-inner blog-post-head">
          <Link to={blogHubPath('circles')} className="blog-back muted">
            ← 圈子博客
          </Link>
          {note && <h1>{note.title}</h1>}
          {ownerEmail && <p className="muted">{ownerEmail} · 圈内文章</p>}
        </div>
      </header>
      <main className="blog-main blog-article">
        {loading && <p className="muted">加载中…</p>}
        {error && <p className="auth-error">{error}</p>}
        {note && <BlockEditor blocks={note.blocks} onChange={() => {}} readOnly />}
      </main>
    </div>
  );
}
