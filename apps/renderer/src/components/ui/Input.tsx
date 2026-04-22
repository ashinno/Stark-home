import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

const baseField = cn(
  'w-full bg-[var(--bg-raised)] border border-[var(--line)]',
  'rounded-[var(--radius-md)] px-3.5 py-2.5 text-sm',
  'placeholder:text-[var(--fg-ghost)]',
  'transition-colors duration-150',
  'hover:border-[var(--line-strong)]',
  'focus:border-[var(--primary)] focus:bg-[var(--surface)]',
  'focus:[box-shadow:var(--ring-focus)]',
  'disabled:opacity-50',
);

type InputProps = InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode };

export function Input({ className, leading, ...rest }: InputProps) {
  if (leading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2',
          baseField,
          'focus-within:border-[var(--primary)] focus-within:bg-[var(--surface)] focus-within:[box-shadow:var(--ring-focus)]',
          className,
        )}
      >
        <span className="text-[var(--fg-dim)]">{leading}</span>
        <input
          {...rest}
          className="flex-1 bg-transparent outline-none placeholder:text-[var(--fg-ghost)]"
        />
      </div>
    );
  }
  return <input {...rest} className={cn(baseField, className)} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea {...rest} className={cn(baseField, 'resize-none', className)} />;
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
