import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Note } from '@webbook/shared';
import { apiClient } from '@/lib/api';
import { userBlogPath, formatDate, readingTime } from '@/lib/blog';
import { BlogArticleView } from '@/components/blog/BlogArticleView';
import { Skeleton } from '@/components/Skeleton';
import { ReadingProgress } from '@/components/ReadingProgress';
import { CommentSection } from '@/components/CommentSection';
import { ArticleToc } from '@/components/ArticleToc';

function ShareButton() {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
      {copied ? '已复制' : '分享'}
    </button>
  );
}

export function BlogPostPage() {
  const { ownerId, noteId, id } = useParams();
  const [note, setNote] = useState<Note | null>(null);
  const [owner, setOwner] = useState<string>('legacy');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const [showTop, setShowTop] = useState(false);

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

  useEffect(() => {
    function onScroll() {
      setShowTop(window.scrollY > 400);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="blog-shell">
      <ReadingProgress target={articleRef} />
      <header className="blog-header">
        <div className="blog-header-inner blog-post-head">
          <Link to={userBlogPath(owner)} className="blog-back muted">
            ← 作者博客
          </Link>
          <div className="blog-post-head-actions">
            {note && <h1>{note.title}</h1>}
            {note && <ShareButton />}
          </div>
          {note && (
            <div className="blog-meta">
              <Link to={userBlogPath(owner)} className="blog-author-link">作者博客</Link>
              <span>{formatDate(note.updatedAt)}</span>
              <span>{readingTime(note.summary)}</span>
            </div>
          )}
        </div>
      </header>
      <main ref={articleRef} className="blog-main blog-article">
        <div className="blog-article-layout">
          <div className="blog-article-col">
            {loading && (
              <div className="blog-article">
                <Skeleton style={{ height: 32, width: '60%', marginBottom: 24 }} />
                <Skeleton style={{ height: 18, marginBottom: 12 }} />
                <Skeleton style={{ height: 18, marginBottom: 12 }} />
                <Skeleton style={{ height: 18, width: '70%', marginBottom: 12 }} />
                <Skeleton style={{ height: 18, width: '45%' }} />
              </div>
            )}
            {error && <p className="auth-error">{error}</p>}
            {note && (
              <>
                {note.summary && (
                  <p className="blog-summary muted">{note.summary}</p>
                )}
                <BlogArticleView blocks={note.blocks} />
                <CommentSection ownerId={owner} noteId={note.id} />
              </>
            )}
          </div>
          {note && <ArticleToc blocks={note.blocks} />}
        </div>
      </main>
      <button
        type="button"
        className={`back-to-top ${showTop ? 'visible' : ''}`}
        aria-label="回到顶部"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        ↑
      </button>
    </div>
  );
}
