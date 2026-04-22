import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Cross-fade + subtle translate between route children. The parent
 * should pass a stable `routeKey` — on change, React remounts the
 * child and the enter animation replays.
 */
export function RouteTransition({
  routeKey,
  children,
  className,
}: {
  routeKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div key={routeKey} className={cn('h-full anim-in', className)}>
      {children}
    </div>
  );
}
