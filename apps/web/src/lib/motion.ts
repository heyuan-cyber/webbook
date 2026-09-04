import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

/** Shared motion exports so the app has one import surface. */
export { motion, AnimatePresence, useReducedMotion };

/** Motion token values mirroring the CSS --dur-* / --ease* tokens. */
export const MOTION = {
  fast: { duration: 0.12, ease: [0.4, 0, 0.2, 1] as const },
  base: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const },
  slow: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const },
} as const;

/** `true` when the user prefers reduced motion; short-circuits animations. */
export function useMotionSafe(): boolean {
  return useReducedMotion() === true;
}
