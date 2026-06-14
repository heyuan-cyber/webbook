import { create } from 'zustand';
import { uid } from '@/lib/id';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(kind, message) {
    const id = uid('toast');
    set({ toasts: [...get().toasts, { id, kind, message }] });
    const t = setTimeout(() => {
      get().dismiss(id);
      timers.delete(id);
    }, 3200);
    timers.set(id, t);
  },
  dismiss(id) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
  },
}));

export function toast(kind: ToastKind, message: string) {
  useToastStore.getState().push(kind, message);
}
