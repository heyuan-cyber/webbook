import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Circle, CircleShareStatus, PublicFeedItem } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { blogPostPath, userBlogPath } from '@/lib/blog';
import { toast } from '@/store/useToastStore';

export function CircleDetailPage() {
  const { id } = useParams();
  const { session, isGuest } = useAuth();
  const navigate = useNavigate();
  const [circle, setCircle] = useState<Circle | null>(null);
  const [feed, setFeed] = useState<PublicFeedItem[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(true);

  const token = session?.token;
  const myMember = circle?.members.find((m) => m.userId === session?.userId);
  const isOwner = circle?.ownerId === session?.userId;

  useEffect(() => {
    if (isGuest || !token || !id) {
      navigate('/login');
      return;
    }
    setLoading(true);
    void Promise.all([apiClient.getCircle(id, token), apiClient.getCircleFeed(id, token)])
      .then(([full, res]) => {
        setCircle(full);
        setFeed(res.feed);
      })
      .catch(() => toast('error', '加载圈子失败'))
      .finally(() => setLoading(false));
  }, [id, token, isGuest, navigate]);

  async function sendInvite() {
    if (!token || !id || !inviteEmail.trim()) return;
    try {
      const updated = await apiClient.inviteToCircle(id, inviteEmail.trim(), token);
      setCircle(updated);
      setInviteEmail('');
      toast('success', '邀请已发送');
    } catch {
      toast('error', '邀请失败');
    }
  }

  async function setShare(status: CircleShareStatus) {
    if (!token || !id) return;
    try {
      const updated = await apiClient.updateCircleShare(id, status, token);
      setCircle(updated);
      const res = await apiClient.getCircleFeed(id, token);
      setFeed(res.feed);
      toast('success', status === 'public_feed' ? '已向圈子分享公开笔记' : '已停止分享');
    } catch {
      toast('error', '更新失败');
    }
  }

  async function leave() {
    if (!token || !id || !session?.userId) return;
    try {
      await apiClient.leaveCircle(id, session.userId, token);
      toast('success', '已退出圈子');
      navigate('/app/circles');
    } catch {
      toast('error', '退出失败');
    }
  }

  if (isGuest || !id) return null;

  return (
    <div className="circle-page">
      <header className="circle-page-head">
        <Link to="/app/circles" className="blog-back muted">
          ← 全部圈子
        </Link>
        {circle && <h1>{circle.name}</h1>}
        {myMember && (
          <div className="circle-share-row">
            <span className="muted">我的共享：</span>
            <button
              type="button"
              className={`btn btn-ghost ${myMember.shareStatus === 'public_feed' ? 'active' : ''}`}
              onClick={() => void setShare('public_feed')}
            >
              分享公开笔记
            </button>
            <button
              type="button"
              className={`btn btn-ghost ${myMember.shareStatus === 'none' ? 'active' : ''}`}
              onClick={() => void setShare('none')}
            >
              不分享
            </button>
          </div>
        )}
      </header>

      {loading && <p className="muted">加载中…</p>}

      {circle && isOwner && (
        <section className="circle-invite-box">
          <h2>邀请成员</h2>
          <div className="circle-create-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="对方注册邮箱"
            />
            <button type="button" className="btn btn-primary" onClick={() => void sendInvite()}>
              邀请
            </button>
          </div>
        </section>
      )}

      {circle && (
        <section>
          <h2>成员 ({circle.members.length})</h2>
          <ul className="circle-members">
            {circle.members.map((m) => (
              <li key={m.userId}>
                <Link to={userBlogPath(m.userId)} className="circle-member-blog">
                  {m.email}
                </Link>
                <span className="muted">
                  {m.role === 'owner' ? '圈主' : '成员'} ·{' '}
                  {m.shareStatus === 'public_feed' ? '分享中' : '未分享'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>圈内动态（公开笔记）</h2>
        {feed.length === 0 && !loading && (
          <p className="muted">暂无动态。成员需开启「分享公开笔记」且拥有 public 笔记。</p>
        )}
        <ul className="blog-list">
          {feed.map((post) => (
            <li key={`${post.ownerId}:${post.noteId}`}>
              <Link to={blogPostPath(post)} className="blog-card" target="_blank">
                <span className="blog-card-title">{post.title}</span>
                <span className="blog-card-meta muted">{post.ownerEmail}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {!isOwner && (
        <button type="button" className="btn btn-ghost circle-leave" onClick={() => void leave()}>
          退出圈子
        </button>
      )}
    </div>
  );
}
