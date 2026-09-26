import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, MOTION, useMotionSafe } from '@/lib/motion';
import { useNotesStore } from '@/store/useNotesStore';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * 关闭后把焦点归还到这里。
   *
   * 由调用方在**触发时**登记（点击命令栏的按钮）。不在组件内部猜"打开前焦点是谁"：
   * 面板内输入框的 `autoFocus` 会在 React 提交阶段就抢走焦点，而用 focusin 监听
   * 又会被面板容器 ref 的就绪时序带偏 —— 实测记录到的目标是 `cp-input` 自己。
   * 由调用方直接给定最可靠。
   */
  returnFocusTo?: HTMLElement | null;
}) {
  const navigate = useNavigate();
  const reduced = useMotionSafe();
  const addNote = useNotesStore((s) => s.addNote);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  /** 面板容器：用于把 Tab 焦点限制在面板内 */
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** 是否处于"打开中"状态，用于只在真正的 close 转换上归还焦点 */
  const wasOpenRef = useRef(false);
  /** 待执行的归还帧（不返回 cleanup，避免 StrictMode 双调用把 rAF 取消掉） */
  const rafRef = useRef<number | null>(null);
  /** 打开那一刻锁定的归还目标 */
  const targetRef = useRef<HTMLElement | null>(null);

  // 记录 / 归还焦点
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      targetRef.current = returnFocusTo ?? null;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const target = targetRef.current;
    if (!target) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (target.isConnected) target.focus();
      });
    });
  }, [open]);

  const commands = useMemo<Cmd[]>(
    () => [
      { id: 'app', label: '打开记事本', hint: '/app', run: () => navigate('/app') },
      { id: 'blog', label: '博客广场', hint: '/blog', run: () => navigate('/blog') },
      { id: 'admin', label: '管理后台', hint: '/admin', run: () => navigate('/admin') },
      {
        id: 'new',
        label: '新建笔记',
        hint: '新笔记',
        run: async () => {
          const id = await addNote(null, '未命名笔记');
          navigate(`/app/note/${id}`);
        },
      },
    ],
    [navigate, addNote],
  );

  const filtered = useMemo(
    () =>
      commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase())),
    [commands, q],
  );

  useEffect(() => {
    setSel(0);
  }, [q, open]);

  useEffect(() => {
    if (!open) {
      setQ('');
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // 原先只处理方向键与回车，Esc 无响应 —— 唯一的退出方式是点命令或点遮罩，
        // 对键盘用户等于关不掉。
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        // 面板内只有"输入框 + 若干命令项"，把 Tab 限制在面板内，
        // 否则焦点会跑到背后的顶栏/侧栏上（视觉上仍盖着遮罩）。
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>('input, button');
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' && filtered[sel]) {
        e.preventDefault();
        filtered[sel]!.run();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, sel, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="cp-backdrop"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={reduced ? { duration: 0 } : MOTION.fast}
          onClick={onClose}
        >
          <motion.div
            className="cp"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="搜索或跳转"
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={reduced ? { duration: 0 } : MOTION.fast}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="cp-input"
              placeholder="搜索或输入命令…"
              aria-label="搜索或输入命令"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="cp-list">
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={`cp-item ${i === sel ? 'active' : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => {
                    c.run();
                    onClose();
                  }}
                >
                  <span>{c.label}</span>
                  {c.hint ? <span className="cp-hint muted">{c.hint}</span> : null}
                </button>
              ))}
              {filtered.length === 0 ? <p className="muted">无匹配命令</p> : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
