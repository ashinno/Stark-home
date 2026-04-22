import { cn } from '../../lib/cn';

type Props = {
  className?: string;
  /** Tailwind height class, e.g. "h-4". */
  height?: string;
  /** Tailwind width class, e.g. "w-full". */
  width?: string;
  /** Tailwind rounded class. Defaults to a subtle radius. */
  rounded?: string;
};

/**
 * Shimmering placeholder block. The shimmer uses the existing
 * `stark-shimmer` keyframe so it respects `prefers-reduced-motion`.
 */
export function Skeleton({ className, height = 'h-4', width = 'w-full', rounded = 'rounded-[var(--radius-xs)]' }: Props) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden bg-[var(--surface-2)]',
        height,
        width,
        rounded,
        className,
      )}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, var(--surface-3) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'stark-shimmer 1.4s linear infinite',
        }}
      />
    </div>
  );
}

/** Multi-line block: a few Skeleton rows stacked with sensible widths. */
export function SkeletonBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-4/5', 'w-3/5', 'w-2/3', 'w-1/2'];
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height="h-3" width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

/** Card-shaped skeleton — useful for list tiles. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Skeleton height="h-8" width="w-8" rounded="rounded-[var(--radius-xs)]" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton height="h-3" width="w-2/3" />
          <Skeleton height="h-3" width="w-full" />
          <Skeleton height="h-3" width="w-4/5" />
        </div>
      </div>
    </div>
  );
}
