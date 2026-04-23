import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type Tab<K extends string> = {
  id: K;
  label: string;
  icon?: typeof import('lucide-react').Home;
  badge?: ReactNode;
};

type Props<K extends string> = {
  tabs: readonly Tab<K>[];
  active: K;
  onSelect: (id: K) => void;
  className?: string;
  /** Additional classes on the strip row (e.g. padding for the page). */
  rowClassName?: string;
};

/**
 * Shared tab strip with an animated underline. The underline
 * interpolates its width and position when you change tabs, driven
 * by the measured DOM rect of the active button.
 */
export function TabStrip<K extends string>({
  tabs,
  active,
  onSelect,
  className,
  rowClassName,
}: Props<K>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<K, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const btn = btnRefs.current.get(active);
    if (!row || !btn) return;
    const rowRect = row.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({ x: btnRect.left - rowRect.left, w: btnRect.width });
  }, [active, tabs]);

  return (
    <div
      ref={rowRef}
      className={cn(
        'relative flex gap-0.5 overflow-x-auto',
        rowClassName,
      )}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) btnRefs.current.set(t.id, el);
              else btnRefs.current.delete(t.id);
            }}
            onClick={() => onSelect(t.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm transition-colors duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
              'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] rounded-[var(--radius-xs)]',
              isActive ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
              className,
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{t.label}</span>
            {t.badge}
          </button>
        );
      })}
      {indicator && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-[2px] rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary-glow)]"
            style={{
              left: indicator.x + 8,
              width: Math.max(0, indicator.w - 16),
              transition:
                'left var(--motion-dur-md) var(--motion-ease-out), width var(--motion-dur-md) var(--motion-ease-out)',
            }}
          />
          {/* Side tick marks bracket the active tab — reads as a switch. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-1.5 w-px bg-[var(--primary)]/70"
            style={{
              left: indicator.x + 8,
              transition: 'left var(--motion-dur-md) var(--motion-ease-out)',
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-1.5 w-px bg-[var(--primary)]/70"
            style={{
              left: indicator.x + indicator.w - 9,
              transition: 'left var(--motion-dur-md) var(--motion-ease-out)',
            }}
          />
        </>
      )}
    </div>
  );
}
