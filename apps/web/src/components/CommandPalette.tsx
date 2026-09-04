import { useEffect, useMemo, useState } from 'react';
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
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const reduced = useMotionSafe();
  const addNote = useNotesStore((s) => s.addNote);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

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
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={reduced ? { duration: 0 } : MOTION.fast}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="cp-input"
              placeholder="搜索或输入命令…"
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
