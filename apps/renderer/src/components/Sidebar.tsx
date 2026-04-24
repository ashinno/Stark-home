import { useLayoutEffect, useRef, useState } from 'react';
import {
  Home,
  MessagesSquare,
  Wrench,
  Sparkles,
  CalendarClock,
  Library,
  Radio,
  Activity as ActivityIcon,
  ServerCog,
  Settings as Cog,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useSession, type Route } from '../stores/session';
import { Kbd } from './ui/Atoms';
import { Logo } from './Logo';

type Item = { id: Route; label: string; icon: typeof Home; hotkey: string };

const items: Item[] = [
  { id: 'home', label: 'Home', icon: Home, hotkey: '1' },
  { id: 'threads', label: 'Threads', icon: MessagesSquare, hotkey: '2' },
  { id: 'tools', label: 'Tools', icon: Wrench, hotkey: '3' },
  { id: 'skills', label: 'Skills', icon: Sparkles, hotkey: '4' },
  { id: 'automations', label: 'Automations', icon: CalendarClock, hotkey: '5' },
  { id: 'memory', label: 'Memory', icon: Library, hotkey: '6' },
  { id: 'gateways', label: 'Gateways', icon: Radio, hotkey: '7' },
  { id: 'activity', label: 'Activity', icon: ActivityIcon, hotkey: '8' },
  { id: 'system', label: 'System', icon: ServerCog, hotkey: '9' },
];

export function Sidebar() {
  const route = useSession((s) => s.route);
  const setRoute = useSession((s) => s.setRoute);
  const rowRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<Route, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ y: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const btn = btnRefs.current.get(route);
    if (!row || !btn) return;
    const rowRect = row.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({ y: btnRect.top - rowRect.top + btnRect.height / 2 - 10, h: 20 });
  }, [route]);

  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-raised)]/50 p-3">
      <div className="font-mono mb-2 mt-1 px-3 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-ghost)]">
        Control center
      </div>
      <div ref={rowRef} className="relative flex flex-col gap-0.5">
        {indicator && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 w-[2px] rounded-r bg-[var(--primary)] shadow-[0_0_10px_var(--primary-glow)]"
            style={{
              top: indicator.y,
              height: indicator.h,
              transition:
                'top var(--motion-dur-md) var(--motion-ease-spring), height var(--motion-dur-md) var(--motion-ease-out)',
            }}
          />
        )}
        {items.map(({ id, label, icon: Icon, hotkey }, i) => {
          const active = route === id;
          return (
            <button
              key={id}
              ref={(el) => {
                if (el) btnRefs.current.set(id, el);
                else btnRefs.current.delete(id);
              }}
              onClick={() => setRoute(id)}
              aria-current={active ? 'page' : undefined}
              style={{ '--i': i } as React.CSSProperties}
              className={cn(
                'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm',
                'transition-[background-color,color] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
                'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
                active
                  ? 'bg-[var(--primary-wash)] text-[var(--fg)]'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 transition-colors duration-[var(--motion-dur-sm)]',
                  active ? 'text-[var(--primary)]' : 'text-[var(--fg-dim)]',
                )}
              />
              <span className="flex-1 text-left">{label}</span>
              <span
                className={cn(
                  'transition-opacity duration-[var(--motion-dur-sm)]',
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                <Kbd>⌘{hotkey}</Kbd>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <button
          onClick={() => setRoute('settings')}
          aria-current={route === 'settings' ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm',
            'transition-[background-color,color] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
            'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
            route === 'settings'
              ? 'bg-[var(--primary-wash)] text-[var(--fg)]'
              : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
          )}
        >
          <Cog className={cn('h-4 w-4 transition-colors duration-[var(--motion-dur-sm)]', route === 'settings' ? 'text-[var(--primary)]' : 'text-[var(--fg-dim)]')} />
          <span className="flex-1 text-left">Settings</span>
          <Kbd>⌘,</Kbd>
        </button>
        <div className="hairline" />
        <div className="flex items-center gap-2.5 px-3">
          <Logo size={20} tone="primary" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--fg-muted)]">
              Stark
            </div>
            <div className="text-[10px] text-[var(--fg-ghost)]">local agent</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
