import { useEffect, useState, type RefObject } from 'react';

export function ReadingProgress({ target }: { target: RefObject<HTMLElement | null> }) {
  const [p, setP] = useState(0);

  useEffect(() => {
    function update() {
      const el = target.current;
      if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      if (total <= 0) {
        setP(1);
        return;
      }
      const rect = el.getBoundingClientRect();
      setP(Math.min(1, Math.max(0, -rect.top / total)));
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [target]);

  return (
    <div
      className="reading-progress"
      aria-hidden="true"
      style={{ transform: `scaleX(${p})` }}
    />
  );
}
