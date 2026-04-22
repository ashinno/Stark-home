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
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)]',
        'shadow-[var(--shadow-sm)]',
        'transition-colors duration-150',
        glow && 'ring-1 ring-[var(--primary)]/40 shadow-[0_0_30px_-10px_var(--primary-glow)]',
        interactive &&
          'cursor-pointer hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]',
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
