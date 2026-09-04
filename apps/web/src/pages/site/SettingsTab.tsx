import { useEffect, useState } from 'react';
import type { PublicFeedItem } from '@webbook/shared';
import { apiClient, type SiteConfig } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import { assetUrl } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton';

/**
 * 设置（仅站主可见）：为「项目示例」「博客」两个区域指派笔记，并调整博客类别顺序。
 * 保存到 profile 站点配置。
 */
export function SettingsTab({
  posts,
  site,
  onSaved,
}: {
  posts: PublicFeedItem[];
  site: SiteConfig | null;
  onSaved: (site: SiteConfig) => void;
}) {
  const { session } = useAuth();
  const [workIds, setWorkIds] = useState<string[]>(site?.workNoteIds ?? []);
  const [blogIds, setBlogIds] = useState<string[]>(site?.blogNoteIds ?? []);
  const [categoryOrder, setCategoryOrder] = useState<string[]>(site?.blogCategoryOrder ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWorkIds(site?.workNoteIds ?? []);
    setBlogIds(site?.blogNoteIds ?? []);
    setCategoryOrder(site?.blogCategoryOrder ?? []);
  }, [site]);

  const categories = [...new Set(posts.map((p) => p.category?.trim()).filter(Boolean) as string[])];
  // 按 categoryOrder 排序（未列出的放后面）
  const orderedCats = [...categories].sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'zh-CN');
  });

  function toggle(id: string, list: string[], setList: (v: string[]) => void) {
    setSaved(false);
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function moveCat(list: string[], idx: number, dir: -1 | 1) {
    const next = [...list];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setSaved(false);
    setCategoryOrder(next);
  }

  async function save() {
    if (!session?.token) return;
    setSaving(true);
    setError(null);
    try {
      const next: SiteConfig = { workNoteIds: workIds, blogNoteIds: blogIds, blogCategoryOrder: categoryOrder };
      await apiClient.saveSiteConfig(next, session.token);
      setSaved(true);
      onSaved(next);
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  const NotePicker = ({
    head,
    ids,
    setIds,
    hint,
  }: {
    head: string;
    ids: string[];
    setIds: (v: string[]) => void;
    hint: string;
  }) => (
    <div className="io-settings-block">
      <h3 className="io-settings-title">{head}</h3>
      <p className="io-settings-hint muted">{hint}</p>
      <div className="io-settings-list">
        {posts.length === 0 ? (
          <Skeleton style={{ height: 60 }} />
        ) : (
          posts.map((p) => {
            const cover = p.cover ? assetUrl(p.cover) : undefined;
            const on = ids.includes(p.noteId);
            return (
              <button
                key={p.noteId}
                type="button"
                className={`io-settings-item ${on ? 'on' : ''}`}
                onClick={() => toggle(p.noteId, ids, setIds)}
              >
                {cover ? (
                  <img className="io-settings-thumb" src={cover} alt="" loading="lazy" />
                ) : (
                  <span className="io-settings-thumb io-settings-thumb-empty" aria-hidden="true" />
                )}
                <span className="io-settings-item-body">
                  <span className="io-settings-item-title">{p.title}</span>
                  {p.category ? <span className="io-settings-item-cat muted">{p.category}</span> : null}
                </span>
                <span className="io-settings-check" aria-hidden="true">{on ? '✓' : ''}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="io-settings">
      <header className="io-settings-head">
        <h2 className="io-settings-h2">站点设置</h2>
        <p className="muted">
          为「项目示例」和「博客」两个区域指派公开笔记。只有你能看到并修改这里。
        </p>
      </header>

      <NotePicker
        head="项目示例区"
        hint="选中的笔记会作为横向作品卡片出现在「项目示例」页。"
        ids={workIds}
        setIds={setWorkIds}
      />
      <NotePicker
        head="博客区"
        hint="选中的笔记会按类别分组出现在「博客」页。"
        ids={blogIds}
        setIds={setBlogIds}
      />

      <div className="io-settings-block">
        <h3 className="io-settings-title">博客类别顺序</h3>
        <p className="io-settings-hint muted">调整博客分组类别的展示顺序（用过的类别会自动出现）。</p>
        {orderedCats.length === 0 ? (
          <p className="muted">还没有可排序的类别。</p>
        ) : (
          <ol className="io-settings-cats">
            {orderedCats.map((c, i) => (
              <li key={c} className="io-settings-cat">
                <span className="io-settings-cat-name">{c}</span>
                <span className="io-settings-cat-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={i === 0}
                    onClick={() => moveCat(orderedCats, i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={i === orderedCats.length - 1}
                    onClick={() => moveCat(orderedCats, i, 1)}
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="io-settings-actions">
        {error ? <span className="auth-error">{error}</span> : null}
        {saved ? <span className="io-settings-saved">已保存 ✓</span> : null}
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
