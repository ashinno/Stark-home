import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'signal';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--primary)] text-[var(--primary-ink)] hover:bg-[var(--primary-hover)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_10px_20px_-12px_var(--primary-glow)]',
  secondary:
    'bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--line)] hover:bg-[var(--surface-3)] hover:border-[var(--line-strong)]',
  ghost:
    'bg-transparent text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
  destructive:
    'bg-transparent text-[var(--bad)] border border-[var(--bad)]/40 hover:bg-[var(--bad-wash)]',
  signal:
    'bg-[var(--accent-signal-wash)] text-[var(--accent-signal)] border border-[var(--accent-signal)]/40 hover:bg-[var(--accent-signal)]/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-[var(--radius-sm)] gap-1.5',
  md: 'h-10 px-4 text-sm rounded-[var(--radius-md)] gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-[var(--radius-md)] gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  leading,
  trailing,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'no-drag inline-flex items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
        'active:translate-y-[0.5px] active:scale-[0.985]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:active:translate-y-0',
        'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
        sizes[size],
        variants[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-[stark-spin_0.7s_linear_infinite]" /> : leading}
      {children}
      {!loading && trailing}
    </button>
  );
}
