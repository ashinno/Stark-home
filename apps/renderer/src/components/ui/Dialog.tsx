import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closable?: boolean;
}) {
  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closable, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-[var(--bg)]/80 backdrop-blur-md anim-in"
        onClick={closable ? onClose : undefined}
      />
      <div
        className={cn(
          'relative w-full anim-in-scale rounded-[var(--radius-xl)]',
          'border border-[var(--line)] bg-[var(--surface)]',
          'shadow-[var(--shadow-lg)]',
          widths[size],
        )}
      >
        {(title || closable) && (
          <div className="flex items-start justify-between gap-6 px-7 pt-6 pb-3">
            <div>
              {title && (
                <h2 className="font-display text-[28px] leading-tight">{title}</h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>
              )}
            </div>
            {closable && (
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-[var(--fg-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="px-7 pb-7">{children}</div>
      </div>
    </div>
  );
}
