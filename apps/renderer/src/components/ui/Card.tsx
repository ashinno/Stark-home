import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Props = HTMLAttributes<HTMLDivElement> & {
  glow?: boolean;
  interactive?: boolean;
};

export function Card({ className, glow = false, interactive = false, children, ...rest }: Props) {
  return (
    <div
      {...rest}
      tabIndex={interactive ? 0 : rest.tabIndex}
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]',
        'shadow-[var(--shadow-sm)]',
        'transition-[background-color,border-color,box-shadow,transform] duration-[var(--motion-dur-md)] ease-[var(--motion-ease-out)]',
        glow && 'ring-1 ring-[var(--primary)]/40 shadow-[0_0_30px_-10px_var(--primary-glow)]',
        interactive &&
          'cursor-pointer hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:-translate-y-[1px] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="border-b border-[var(--line)] px-5 py-4">{children}</div>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
