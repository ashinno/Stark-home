import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Presence } from './Presence';

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
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open || !triggerRef.current) return;
    if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closable, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <Presence when={open} variant="fade" exitMs={180}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div
          className="absolute inset-0 bg-[var(--bg)]/80 backdrop-blur-md"
          onClick={closable ? onClose : undefined}
        />
        <div
          ref={panelRef}
          className={cn(
            'tick-frame relative w-full anim-in-scale rounded-[var(--radius-xl)]',
            'border border-[var(--line)] bg-[var(--surface)]',
            'shadow-[var(--shadow-lg)]',
            widths[size],
          )}
          style={{ animationDelay: '60ms' }}
        >
          {(title || closable) && (
            <>
              <div className="flex items-start justify-between gap-6 px-7 pt-6 pb-3">
                <div>
                  {title && (
                    <>
                      <div className="font-mono mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[var(--primary)]">
                        <span className="inline-block h-px w-4 bg-[var(--primary)]/70" />
                        dialog
                      </div>
                      <h2 className="font-display text-[28px] leading-tight">{title}</h2>
                    </>
                  )}
                  {description && (
                    <p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>
                  )}
                </div>
                {closable && (
                  <button
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="rounded-full p-1.5 text-[var(--fg-dim)] transition-colors duration-[var(--motion-dur-sm)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div
                aria-hidden
                className="ink-rule mx-7 h-px"
                style={{ background: 'var(--line)', transformOrigin: 'left center' }}
              />
            </>
          )}
          <div className="px-7 pb-7 pt-5">{children}</div>
        </div>
      </div>
    </Presence>
  );
}
