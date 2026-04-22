import { cn } from '../lib/cn';

/**
 * Stark mark — a compass-star.
 *
 * A sharp four-point star with a slightly longer vertical axis. Designed as
 * a silhouette that reads in both light and dark modes. Fill uses `currentColor`
 * so callers set the tint via `color`.
 */
export function Logo({
  size = 28,
  className,
  tone = 'primary',
}: {
  size?: number;
  className?: string;
  tone?: 'primary' | 'fg' | 'inherit';
}) {
  const toneClass =
    tone === 'primary'
      ? 'text-[color:var(--primary)]'
      : tone === 'fg'
        ? 'text-[color:var(--fg)]'
        : '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn(toneClass, className)}
    >
      <polygon
        points="16,1.5 18.4,13.4 30.5,16 18.4,18.6 16,30.5 13.6,18.6 1.5,16 13.6,13.4"
        fill="currentColor"
      />
      <polygon
        points="16,7.8 17.1,14 23,16 17.1,18 16,24.2 14.9,18 9,16 14.9,14"
        fill="var(--bg)"
        opacity="0.18"
      />
    </svg>
  );
}

/** Full wordmark: compass star + "STARK" set wide. */
export function Wordmark({
  size = 20,
  subtle = false,
}: {
  size?: number;
  subtle?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={size} tone={subtle ? 'fg' : 'primary'} />
      <span
        className="font-sans"
        style={{
          fontSize: size * 0.82,
          letterSpacing: '0.28em',
          fontWeight: 600,
          textTransform: 'uppercase',
          color: subtle ? 'var(--fg-muted)' : 'var(--fg)',
        }}
      >
        Stark
      </span>
    </div>
  );
}
