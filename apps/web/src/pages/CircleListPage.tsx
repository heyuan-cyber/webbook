import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CircleSummary, CircleVisibility, CircleJoinPolicy, DiscoverableCircle } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { toast } from '@/store/useToastStore';

function joinPolicyLabel(policy: CircleJoinPolicy): string {
  return policy === 'open' ? '无需审核' : '需圈主同意';
}

export function CircleListPage() {
  const { session, isGuest } = useAuth();
  const navigate = useNavigate();
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [discover, setDiscover] = useState<DiscoverableCircle[]>([]);
  const [invites, setInvites] = useState<{ circle: CircleSummary; invitedAt: string }[]>([]);
  const [joinRequests, setJoinRequests] = useState<
    { circle: DiscoverableCircle; requestedAt: string }[]
  >([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<CircleVisibility>('private');
  const [joinPolicy, setJoinPolicy] = useState<CircleJoinPolicy>('approval');
  const [loading, setLoading] = useState(true);

  async function reload(token: string) {
    const [c, inv, disc, reqs] = await Promise.all([
      apiClient.listCircles(token),
      apiClient.listCircleInvites(token),
      apiClient.discoverCircles(token),
      apiClient.listMyJoinRequests(token),
    ]);
    setCircles(c.circles);
    setInvites(inv.invites);
    setDiscover(disc.circles);
    setJoinRequests(reqs.requests);
  }

  useEffect(() => {
    if (isGuest || !session?.token) {
      navigate('/login');
      return;
    }
    setLoading(true);
    void reload(session.token)
      .catch(() => toast('error', '加载圈子失败'))
      .finally(() => setLoading(false));
  }, [isGuest, session, navigate]);

  async function createCircle() {
    if (!session?.token || !name.trim()) return;
    try {
      const circle = await apiClient.createCircle(
        {
          name: name.trim(),
          description: description.trim(),
          visibility,
          joinPolicy,
        },
        session.token,
      );
      setName('');
      setDescription('');
      setVisibility('private');
      setJoinPolicy('approval');
      navigate(`/app/circles/${circle.id}`);
    } catch {
      toast('error', '创建失败');
    }
  }

  async function acceptInvite(circleId: string) {
    if (!session?.token) return;
    try {
      await apiClient.acceptCircleInvite(circleId, session.token);
      toast('success', '已加入圈子');
      await reload(session.token);
    } catch {
      toast('error', '接受邀请失败');
    }
  }

  async function joinDiscovered(c: DiscoverableCircle) {
    if (!session?.token) return;
    try {
      if (c.joinPolicy === 'open') {
        await apiClient.joinCircle(c.id, session.token);
        toast('success', '已加入圈子');
      } else {
        await apiClient.requestJoinCircle(c.id, session.token);
        toast('success', '已提交申请，等待圈主审核');
      }
      await reload(session.token);
    } catch {
      toast('error', '操作失败');
    }
  }

  if (isGuest) return null;

  const discoverFiltered = discover.filter((c) => c.myStatus !== 'member');

  return (
    <div className="circle-page">
      <header className="circle-page-head">
        <h1>笔记圈子</h1>
        <p className="muted">发现公开圈子、协作笔记与圈内博客。</p>
        <Link to="/app" className="btn btn-ghost">
          返回笔记本
        </Link>
      </header>

      {invites.length > 0 && (
        <section className="circle-invites">
          <h2>待接受邀请</h2>
          <ul>
            {invites.map((inv) => (
              <li key={inv.circle.id} className="circle-invite-row">
                <span>{inv.circle.name}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void acceptInvite(inv.circle.id)}
                >
                  加入
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {joinRequests.length > 0 && (
        <section className="circle-invites">
          <h2>我的申请中</h2>
          <ul>
            {joinRequests.map((r) => (
              <li key={r.circle.id} className="circle-invite-row">
                <span>
                  {r.circle.name}
                  <span className="muted"> · 等待圈主审核</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>发现圈子</h2>
        {loading && <p className="muted">加载中…</p>}
        {!loading && discoverFiltered.length === 0 && (
          <p className="muted">
            暂无其他公开圈子。将圈子设为「公开」后会出现在这里（圈主本人也可在此确认对外可见）。
          </p>
        )}
        <ul className="circle-list">
          {discoverFiltered.map((c) => (
            <li key={c.id}>
              <div className="circle-card circle-discover-card">
                <span className="circle-card-name">
                  {c.name}
                  {c.myStatus === 'owner' && (
                    <span className="muted"> · 我的公开圈子</span>
                  )}
                </span>
                <span className="muted circle-discover-meta">
                  {c.memberCount} 人 · {joinPolicyLabel(c.joinPolicy)} · 圈主 {c.ownerEmail}
                </span>
                {c.description && <p className="circle-discover-desc">{c.description}</p>}
                {c.myStatus === 'owner' ? (
                  <Link to={`/app/circles/${c.id}`} className="btn btn-ghost btn-sm">
                    管理圈子
                  </Link>
                ) : c.myStatus === 'pending' ? (
                  <span className="muted">申请审核中…</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void joinDiscovered(c)}
                  >
                    {c.joinPolicy === 'open' ? '加入' : '申请加入'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="circle-create">
        <h2>创建圈子</h2>
        <div className="circle-create-form">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="圈子名称"
            maxLength={40}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简介（公开圈子会展示）"
            maxLength={200}
            rows={2}
          />
          <div className="circle-create-options">
            <label>
              可见性
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as CircleVisibility)}
              >
                <option value="private">私密（仅邀请）</option>
                <option value="public">公开（可被发现）</option>
              </select>
            </label>
            <label>
              加入方式
              <select
                value={joinPolicy}
                onChange={(e) => setJoinPolicy(e.target.value as CircleJoinPolicy)}
              >
                <option value="approval">需圈主同意</option>
                <option value="open">无需审核</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void createCircle()}>
            创建
          </button>
        </div>
      </section>

      <section>
        <h2>我的圈子</h2>
        {!loading && circles.length === 0 && (
          <p className="muted">还没有圈子，创建一个或加入公开圈子吧。</p>
        )}
        <ul className="circle-list">
          {circles.map((c) => (
            <li key={c.id}>
              <Link to={`/app/circles/${c.id}`} className="circle-card">
                <span className="circle-card-name">{c.name}</span>
                <span className="muted">
                  {c.memberCount} 人 · {c.myRole === 'owner' ? '圈主' : '成员'}
                  {c.visibility === 'public' ? ' · 公开' : ' · 私密'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
