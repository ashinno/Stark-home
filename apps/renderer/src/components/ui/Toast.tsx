import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: string; kind: ToastKind; title: string; description?: string };

type Store = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
};

/** Total visible time before auto-dismiss begins its exit animation. */
const VISIBLE_MS = 4000;
/** Exit animation duration (matches --motion-dur-sm). */
const EXIT_MS = 320;

export const useToast = create<Store>((set) => ({
  toasts: [],
  push: (t) => {
    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, VISIBLE_MS + EXIT_MS);
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
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setExiting(true), VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, []);

  const stripeTone = {
    success: 'bg-[var(--ok)]',
    error: 'bg-[var(--bad)]',
    info: 'bg-[var(--primary)]',
  }[toast.kind];

  return (
    <div
      className={cn(
        'tick-frame pointer-events-auto relative flex min-w-[280px] max-w-sm items-start gap-3 overflow-hidden',
        'rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)]',
        'px-4 py-3 shadow-[var(--shadow-md)]',
        exiting ? 'anim-out' : 'anim-in',
      )}
      role="status"
      aria-live="polite"
    >
      {/* Left tone stripe — instantly communicates kind at a glance. */}
      <span aria-hidden className={cn('absolute left-0 top-0 h-full w-0.5', stripeTone)} />
      <div className="mt-0.5">{icons[toast.kind]}</div>
      <div className="min-w-0 flex-1">
        <div className="font-mono mb-0.5 text-[9px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
          {toast.kind}
        </div>
        <div className="text-sm font-medium">{toast.title}</div>
        {toast.description && (
          <div className="mt-0.5 text-xs text-[var(--fg-muted)]">{toast.description}</div>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-[var(--radius-xs)] p-0.5 text-[var(--fg-ghost)] transition-colors duration-[var(--motion-dur-sm)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
