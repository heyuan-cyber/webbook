import { AnimatePresence, motion, MOTION, useMotionSafe } from '@/lib/motion';
import { useToastStore } from '@/store/useToastStore';

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const reduced = useMotionSafe();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast-${t.kind}`}
            role="status"
            initial={reduced ? false : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, x: 24 }}
            transition={reduced ? { duration: 0 } : MOTION.base}
          >
            <span>{t.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
