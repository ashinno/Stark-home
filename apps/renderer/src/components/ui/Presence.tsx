import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'fade' | 'scale';

type Props = {
  /** When `when` is falsy the child is unmounted after the exit animation. */
  when: boolean;
  children: ReactNode;
  /** Which enter/exit keyframes to use. `scale` pairs with dialogs/popovers. */
  variant?: Variant;
  /** Extra classes applied to the wrapper. */
  className?: string;
  /** Exit animation duration in ms. Matches --motion-dur-sm by default. */
  exitMs?: number;
  /** Use a span wrapper instead of a div (for inline contexts). */
  as?: 'div' | 'span';
};

/**
 * Mount/unmount transition helper. Renders nothing when fully hidden.
 * While `when` is true the child fades in; when it flips to false the
 * child keeps rendering for `exitMs` with the exit animation applied,
 * then unmounts.
 */
export function Presence({
  when,
  children,
  variant = 'fade',
  className,
  exitMs = 180,
  as = 'div',
}: Props) {
  const [mounted, setMounted] = useState(when);
  const [exiting, setExiting] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (when) {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
    timer.current = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
      timer.current = null;
    }, exitMs);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [when, mounted, exitMs]);

  if (!mounted) return null;
  const enterCls = variant === 'scale' ? 'anim-in-scale' : 'anim-in';
  const exitCls = variant === 'scale' ? 'anim-out-scale' : 'anim-out';
  const Tag = as;

  return (
    <Tag className={cn(exiting ? exitCls : enterCls, className)} aria-hidden={exiting ? true : undefined}>
      {children}
    </Tag>
  );
}
