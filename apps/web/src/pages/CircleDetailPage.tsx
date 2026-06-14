import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Circle, CircleJoinPolicy, CircleVisibility, PublicFeedItem } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { blogPostPath, userBlogPath } from '@/lib/blog';
import { CircleNotesTab } from '@/components/CircleNotesTab';
import { toast } from '@/store/useToastStore';

type CircleTab = 'notes' | 'blog';

export function CircleDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, isGuest } = useAuth();
  const navigate = useNavigate();
  const [circle, setCircle] = useState<Circle | null>(null);
  const [feed, setFeed] = useState<PublicFeedItem[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsVisibility, setSettingsVisibility] = useState<CircleVisibility>('private');
  const [settingsJoinPolicy, setSettingsJoinPolicy] = useState<CircleJoinPolicy>('approval');
  const [loading, setLoading] = useState(true);

  const tab: CircleTab = searchParams.get('tab') === 'blog' ? 'blog' : 'notes';
  const token = session?.token;
  const myMember = circle?.members.find((m) => m.userId === session?.userId);
  const isOwner = circle?.ownerId === session?.userId;
  const canEdit = isOwner || myMember?.collabEdit === true;

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
        setSettingsDesc(full.description ?? '');
        setSettingsVisibility(full.visibility);
        setSettingsJoinPolicy(full.joinPolicy);
      })
      .catch(() => toast('error', '加载圈子失败'))
      .finally(() => setLoading(false));
  }, [id, token, isGuest, navigate]);

  function setTab(next: CircleTab) {
    setSearchParams(next === 'notes' ? {} : { tab: next });
  }

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

  async function setCollab(enabled: boolean) {
    if (!token || !id) return;
    try {
      const updated = await apiClient.updateCircleCollab(id, enabled, token);
      setCircle(updated);
      toast('success', enabled ? '已开启共享编辑' : '已关闭共享编辑');
    } catch {
      toast('error', '更新失败');
    }
  }

  async function saveSettings() {
    if (!token || !id) return;
    try {
      const updated = await apiClient.updateCircleSettings(
        id,
        {
          description: settingsDesc,
          visibility: settingsVisibility,
          joinPolicy: settingsJoinPolicy,
        },
        token,
      );
      setCircle(updated);
      toast('success', '圈子设置已保存');
    } catch {
      toast('error', '保存失败');
    }
  }

  async function approveRequest(userId: string) {
    if (!token || !id) return;
    try {
      const updated = await apiClient.approveJoinRequest(id, userId, token);
      setCircle(updated);
      toast('success', '已通过申请');
    } catch {
      toast('error', '操作失败');
    }
  }

  async function rejectRequest(userId: string) {
    if (!token || !id) return;
    try {
      const updated = await apiClient.rejectJoinRequest(id, userId, token);
      setCircle(updated);
      toast('success', '已拒绝申请');
    } catch {
      toast('error', '操作失败');
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
        {myMember && myMember.role !== 'owner' && (
          <div className="circle-share-row">
            <span className="muted">协作编辑：</span>
            <button
              type="button"
              className={`btn btn-ghost ${myMember.collabEdit ? 'active' : ''}`}
              onClick={() => void setCollab(true)}
            >
              允许共享编辑
            </button>
            <button
              type="button"
              className={`btn btn-ghost ${!myMember.collabEdit ? 'active' : ''}`}
              onClick={() => void setCollab(false)}
            >
              仅阅读
            </button>
          </div>
        )}
        <div className="blog-tabs" role="tablist">
          <button
            type="button"
            className={`btn btn-ghost ${tab === 'notes' ? 'active' : ''}`}
            onClick={() => setTab('notes')}
          >
            笔记
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${tab === 'blog' ? 'active' : ''}`}
            onClick={() => setTab('blog')}
          >
            博客
          </button>
        </div>
      </header>

      {loading && <p className="muted">加载中…</p>}

      {circle && isOwner && !loading && (
        <section className="circle-settings-box">
          <h2>圈子设置</h2>
          <textarea
            value={settingsDesc}
            onChange={(e) => setSettingsDesc(e.target.value)}
            placeholder="简介（公开圈子展示在发现页）"
            maxLength={200}
            rows={2}
          />
          <div className="circle-create-options">
            <label>
              可见性
              <select
                value={settingsVisibility}
                onChange={(e) => setSettingsVisibility(e.target.value as CircleVisibility)}
              >
                <option value="private">私密</option>
                <option value="public">公开</option>
              </select>
            </label>
            <label>
              加入方式
              <select
                value={settingsJoinPolicy}
                onChange={(e) => setSettingsJoinPolicy(e.target.value as CircleJoinPolicy)}
              >
                <option value="approval">需圈主同意</option>
                <option value="open">无需审核</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveSettings()}>
            保存设置
          </button>

          {circle.pendingJoinRequests.length > 0 && (
            <div className="circle-pending-requests">
              <h3>待审核申请 ({circle.pendingJoinRequests.length})</h3>
              <ul>
                {circle.pendingJoinRequests.map((r) => (
                  <li key={r.userId} className="circle-invite-row">
                    <span>{r.email}</span>
                    <span>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void approveRequest(r.userId)}
                      >
                        同意
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void rejectRequest(r.userId)}
                      >
                        拒绝
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {tab === 'notes' && id && !loading && <CircleNotesTab circleId={id} canEdit={canEdit} />}

      {tab === 'blog' && (
        <>
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
                      {m.collabEdit ? '可协作' : '只读'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2>圈内博客</h2>
            <p className="muted">成员的「圈子可见」与「完全公开」笔记</p>
            {feed.length === 0 && !loading && (
              <p className="muted">暂无动态。将个人笔记设为圈子可见或完全公开即可出现在这里。</p>
            )}
            <ul className="blog-list">
              {feed.map((post) => (
                <li key={`${post.ownerId}:${post.noteId}`}>
                  <Link to={blogPostPath(post, id)} className="blog-card">
                    <span className="blog-card-title">{post.title}</span>
                    <span className="blog-card-meta muted">
                      {post.ownerEmail}
                      {post.visibility === 'circle' ? ' · 圈内' : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {!isOwner && (
        <button type="button" className="btn btn-ghost circle-leave" onClick={() => void leave()}>
          退出圈子
        </button>
      )}
    </div>
  );
}
