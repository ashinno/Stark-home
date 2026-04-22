import {
  Home,
  MessagesSquare,
  Wrench,
  Sparkles,
  CalendarClock,
  Library,
  Radio,
  Activity as ActivityIcon,
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
];

export function Sidebar() {
  const route = useSession((s) => s.route);
  const setRoute = useSession((s) => s.setRoute);

  return (
    <nav className="flex w-60 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-raised)]/50 p-3">
      <div className="font-mono mb-2 mt-1 px-3 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-ghost)]">
        Control center
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map(({ id, label, icon: Icon, hotkey }) => {
          const active = route === id;
          return (
            <button
              key={id}
              onClick={() => setRoute(id)}
              className={cn(
                'group relative flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-all duration-150',
                active
                  ? 'bg-[var(--primary-wash)] text-[var(--fg)]'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-[var(--primary)] shadow-[0_0_10px_var(--primary-glow)]"
                />
              )}
              <Icon
                className={cn(
                  'h-4 w-4 transition-colors',
                  active ? 'text-[var(--primary)]' : 'text-[var(--fg-dim)]',
                )}
              />
              <span className="flex-1 text-left">{label}</span>
              <span className={cn('opacity-0 transition-opacity', active ? 'opacity-100' : 'group-hover:opacity-100')}>
                <Kbd>⌘{hotkey}</Kbd>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <button
          onClick={() => setRoute('settings')}
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
            route === 'settings'
              ? 'bg-[var(--primary-wash)] text-[var(--fg)]'
              : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
          )}
        >
          <Cog className="h-4 w-4 text-[var(--fg-dim)]" />
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
            <div className="text-[10px] text-[var(--fg-ghost)]">for Hermes Agent</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
