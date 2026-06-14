import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CircleSummary } from '@webbook/shared';
import { useAuth } from '@/auth/AuthContext';
import { apiClient } from '@/lib/api';
import { toast } from '@/store/useToastStore';

export function CircleListPage() {
  const { session, isGuest } = useAuth();
  const navigate = useNavigate();
  const [circles, setCircles] = useState<CircleSummary[]>([]);
  const [invites, setInvites] = useState<{ circle: CircleSummary; invitedAt: string }[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGuest || !session?.token) {
      navigate('/login');
      return;
    }
    const token = session.token;
    setLoading(true);
    Promise.all([apiClient.listCircles(token), apiClient.listCircleInvites(token)])
      .then(([c, inv]) => {
        setCircles(c.circles);
        setInvites(inv.invites);
      })
      .catch(() => toast('error', '加载圈子失败'))
      .finally(() => setLoading(false));
  }, [isGuest, session, navigate]);

  async function createCircle() {
    if (!session?.token || !name.trim()) return;
    try {
      const circle = await apiClient.createCircle(name.trim(), session.token);
      setName('');
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
      const [c, inv] = await Promise.all([
        apiClient.listCircles(session.token),
        apiClient.listCircleInvites(session.token),
      ]);
      setCircles(c.circles);
      setInvites(inv.invites);
    } catch {
      toast('error', '接受邀请失败');
    }
  }

  if (isGuest) return null;

  return (
    <div className="circle-page">
      <header className="circle-page-head">
        <h1>笔记圈子</h1>
        <p className="muted">圈主制：邀请成员后，互相查看公开笔记与博客动态。</p>
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

      <section className="circle-create">
        <h2>创建圈子</h2>
        <div className="circle-create-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="圈子名称"
            maxLength={40}
          />
          <button type="button" className="btn btn-primary" onClick={() => void createCircle()}>
            创建
          </button>
        </div>
      </section>

      <section>
        <h2>我的圈子</h2>
        {loading && <p className="muted">加载中…</p>}
        {!loading && circles.length === 0 && (
          <p className="muted">还没有圈子，创建一个并邀请朋友吧。</p>
        )}
        <ul className="circle-list">
          {circles.map((c) => (
            <li key={c.id}>
              <Link to={`/app/circles/${c.id}`} className="circle-card">
                <span className="circle-card-name">{c.name}</span>
                <span className="muted">
                  {c.memberCount} 人 · {c.myRole === 'owner' ? '圈主' : '成员'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
