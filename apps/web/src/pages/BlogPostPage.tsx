import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Note } from '@webbook/shared';
import { apiClient } from '@/lib/api';
import { userBlogPath } from '@/lib/blog';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { CommentSection } from '@/components/CommentSection';

export function BlogPostPage() {
  const { ownerId, noteId, id } = useParams();
  const [note, setNote] = useState<Note | null>(null);
  const [owner, setOwner] = useState<string>('legacy');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (ownerId && noteId) {
      void apiClient
        .loadPublicNote(ownerId, noteId)
        .then((n) => {
          setNote(n);
          setOwner(ownerId);
        })
        .catch(() => setError('文章不存在或未公开'))
        .finally(() => setLoading(false));
      return;
    }

    const legacyId = id ?? noteId;
    if (!legacyId) {
      setLoading(false);
      return;
    }

    void apiClient
      .loadPublicNoteLegacy(legacyId)
      .then(({ note: n, ownerId: oid }) => {
        setNote(n);
        setOwner(oid);
      })
      .catch(() => setError('文章不存在或未公开'))
      .finally(() => setLoading(false));
  }, [ownerId, noteId, id]);

  return (
    <div className="blog-shell">
      <header className="blog-header">
        <div className="blog-header-inner blog-post-head">
          <Link to={userBlogPath(owner)} className="blog-back muted">
            ← 作者博客
          </Link>
          {note && <h1>{note.title}</h1>}
        </div>
      </header>
      <main className="blog-main blog-article">
        {loading && <p className="muted">加载中…</p>}
        {error && <p className="auth-error">{error}</p>}
        {note && (
          <>
            {note.summary && (
              <p className="blog-summary muted">{note.summary}</p>
            )}
            <BlockEditor blocks={note.blocks} onChange={() => {}} readOnly />
            <CommentSection ownerId={owner} noteId={note.id} />
          </>
        )}
      </main>
    </div>
  );
}
