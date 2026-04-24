import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

const baseField = cn(
  'w-full bg-[var(--bg-raised)] border border-[var(--line)]',
  'rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm',
  'placeholder:text-[var(--fg-ghost)]',
  'transition-[background-color,border-color,box-shadow] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
  'hover:border-[var(--line-strong)]',
  'focus:border-[var(--primary)] focus:bg-[var(--surface)]',
  'focus:[box-shadow:var(--ring-focus)]',
  'disabled:opacity-50',
);

const errorField = cn(
  'border-[var(--bad)]/60 bg-[var(--bad-wash)]/30',
  'hover:border-[var(--bad)]',
  'focus:border-[var(--bad)] focus:[box-shadow:0_0_0_3px_var(--bad-wash)]',
);

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  leading?: ReactNode;
  error?: string;
};

export function Input({ className, leading, error, ...rest }: InputProps) {
  const hasError = !!error;
  const field = (
    leading ? (
      <div
        className={cn(
          'group flex items-center gap-2',
          baseField,
          'focus-within:border-[var(--primary)] focus-within:bg-[var(--surface)] focus-within:[box-shadow:var(--ring-focus)]',
          hasError && errorField,
          hasError && 'focus-within:border-[var(--bad)] focus-within:[box-shadow:0_0_0_3px_var(--bad-wash)]',
          className,
        )}
      >
        <span
          className={cn(
            'transition-colors duration-[var(--motion-dur-sm)]',
            hasError
              ? 'text-[var(--bad)]'
              : 'text-[var(--fg-dim)] group-focus-within:text-[var(--primary)]',
          )}
        >
          {leading}
        </span>
        <input
          {...rest}
          aria-invalid={hasError || undefined}
          className="flex-1 bg-transparent outline-none placeholder:text-[var(--fg-ghost)]"
        />
      </div>
    ) : (
      <input
        {...rest}
        aria-invalid={hasError || undefined}
        className={cn(baseField, hasError && errorField, className)}
      />
    )
  );
  if (!error) return field;
  return (
    <div>
      {field}
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--bad)] anim-in">
        <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[var(--bad)]" />
        {error}
      </p>
    </div>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string };

export function Textarea({ className, error, ...rest }: TextareaProps) {
  const hasError = !!error;
  return (
    <>
      <textarea
        {...rest}
        aria-invalid={hasError || undefined}
        className={cn(baseField, 'resize-none', hasError && errorField, className)}
      />
      {hasError && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--bad)] anim-in">
          <span aria-hidden className="inline-block h-1 w-1 rounded-full bg-[var(--bad)]" />
          {error}
        </p>
      )}
    </>
  );
}

export function Label({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-baseline justify-between text-[11px] text-[var(--fg-muted)]"
    >
      <span className="font-mono uppercase tracking-[0.14em]">{children}</span>
      {hint && <span className="text-[var(--fg-ghost)] normal-case tracking-normal">{hint}</span>}
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {children}
    </div>
  );
}
