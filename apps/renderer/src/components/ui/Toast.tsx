import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: string; kind: ToastKind; title: string; description?: string };

type Store = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
};

export const useToast = create<Store>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

const icons = {
  success: <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" />,
  error: <AlertCircle className="h-4 w-4 text-[var(--bad)]" />,
  info: <Info className="h-4 w-4 text-[var(--primary)]" />,
};

export function ToastStack() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex min-w-[280px] max-w-sm items-start gap-3 anim-in',
            'rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)]',
            'px-4 py-3 shadow-[var(--shadow-md)]',
          )}
        >
          <div className="mt-0.5">{icons[t.kind]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t.title}</div>
            {t.description && (
              <div className="mt-0.5 text-xs text-[var(--fg-muted)]">{t.description}</div>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="text-[var(--fg-ghost)] hover:text-[var(--fg)]"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
