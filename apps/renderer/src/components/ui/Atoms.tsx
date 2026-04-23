import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from './Skeleton';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono inline-flex items-center rounded-[var(--radius-xs)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)]">
      {children}
    </kbd>
  );
}

type Tone = 'neutral' | 'primary' | 'ok' | 'warn' | 'bad' | 'signal';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-[var(--surface-2)] text-[var(--fg-muted)] border-[var(--line)]',
    primary: 'bg-[var(--primary-wash)] text-[var(--primary)] border-[var(--primary)]/30',
    ok: 'bg-[var(--ok-wash)] text-[var(--ok)] border-[var(--ok)]/30',
    warn: 'bg-[var(--warn-wash)] text-[var(--warn)] border-[var(--warn)]/30',
    bad: 'bg-[var(--bad-wash)] text-[var(--bad)] border-[var(--bad)]/30',
    signal: 'bg-[var(--accent-signal-wash)] text-[var(--accent-signal)] border-[var(--accent-signal)]/30',
  };
  return (
    <span
      className={cn(
        'font-mono inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Dot({
  tone = 'primary',
  pulse = false,
}: {
  tone?: 'primary' | 'ok' | 'warn' | 'bad' | 'dim';
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: 'bg-[var(--primary)] shadow-[0_0_10px_var(--primary-glow)]',
    ok: 'bg-[var(--ok)]',
    warn: 'bg-[var(--warn)]',
    bad: 'bg-[var(--bad)]',
    dim: 'bg-[var(--fg-ghost)]',
  };
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        tones[tone],
        pulse && 'animate-[stark-pulse_1.6s_ease-in-out_infinite]',
      )}
    />
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  loading = false,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  /** When true, show skeleton placeholders instead of the empty-state message. */
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="anim-in flex flex-col items-center gap-3 py-16">
        <Skeleton height="h-11" width="w-11" rounded="rounded-full" />
        <Skeleton height="h-6" width="w-48" />
        <Skeleton height="h-3" width="w-80" />
      </div>
    );
  }
  return (
    <div className="anim-in relative flex flex-col items-center justify-center py-16 text-center">
      {/* Blueprint dot grid fades in behind the message — frames the void. */}
      <div
        aria-hidden
        className="blueprint-grid blueprint-fade pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="font-mono relative mb-4 flex items-center gap-2 text-[9px] uppercase tracking-[0.26em] text-[var(--fg-ghost)]">
        <span className="inline-block h-px w-6 bg-[var(--line-strong)]" />
        empty
        <span className="inline-block h-px w-6 bg-[var(--line-strong)]" />
      </div>
      {icon && (
        <div className="relative mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg-dim)]">
          {icon}
        </div>
      )}
      <h3 className="font-display relative text-2xl">{title}</h3>
      <p className="relative mt-1 max-w-md text-sm text-[var(--fg-muted)]">{description}</p>
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  trailing,
  stamp,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
  /** Small schematic annotation placed below the title — "sheet 02 · kind" style. */
  stamp?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        {eyebrow && (
          <div className="font-mono mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--primary)]">
            <span className="inline-block h-px w-6 bg-[var(--primary)]/60" />
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[30px] leading-tight">{title}</h1>
        {stamp && (
          <div className="font-mono mt-1 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.22em] text-[var(--fg-ghost)]">
            <span>§</span>
            {stamp}
          </div>
        )}
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--fg-muted)]">{description}</p>
        )}
      </div>
      {trailing}
    </div>
  );
}

export function ToneRow({ children }: { children: ReactNode }) {
  return <div className="font-mono flex items-center gap-3 text-[11px] text-[var(--fg-ghost)]">{children}</div>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      <div
        className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300 ease-out"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}
