import { cn } from '../../lib/cn';

/**
 * A crisp pill-shaped toggle switch.
 *
 * Geometry is locked: 40×22 track, 16×16 thumb, 3px inset — giving
 * symmetric padding on every side in both on/off states. The thumb
 * travels 18px, landing flush against the inner edge without overflow.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  loading = false,
  ariaLabel,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={cn(
        'group relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full p-[3px]',
        'transition-[background-color,box-shadow] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
        'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked
          ? 'bg-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_14px_-4px_var(--primary-glow)]'
          : 'bg-[var(--surface-3)] shadow-[inset_0_0_0_1px_var(--line)]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block h-[16px] w-[16px] rounded-full bg-white',
          'shadow-[0_1px_2px_rgba(0,0,0,0.35),inset_0_-1px_0_rgba(0,0,0,0.08)]',
          'transition-transform duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-spring)]',
          'group-active:scale-95',
          checked ? 'translate-x-[18px]' : 'translate-x-0',
          loading && 'animate-[stark-spin_0.7s_linear_infinite]',
        )}
      />
    </button>
  );
}
