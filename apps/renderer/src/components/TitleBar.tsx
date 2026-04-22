import { Sun, Moon, Monitor } from 'lucide-react';
import { Wordmark } from './Logo';
import { Dot, Kbd } from './ui/Atoms';
import { useSession } from '../stores/session';
import { useTheme } from '../stores/theme';
import { cn } from '../lib/cn';
import { ProfilePicker } from './ProfilePicker';

export function TitleBar() {
  const sidecar = useSession((s) => s.sidecar);
  const setPaletteOpen = useSession((s) => s.setPaletteOpen);
  const { theme, setTheme } = useTheme();

  const tone =
    sidecar.state === 'ready' ? 'ok' : sidecar.state === 'error' ? 'bad' : 'warn';
  const label =
    sidecar.state === 'ready'
      ? 'online'
      : sidecar.state === 'starting'
        ? 'starting'
        : sidecar.state === 'error'
          ? 'offline'
          : 'sleeping';

  return (
    <header className="drag relative z-[80] flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg-raised)]/90 px-4 backdrop-blur">
      <div className="flex items-center gap-4 pl-16">
        <Wordmark size={18} />
        <span className="hidden h-4 w-px bg-[var(--line)] sm:block" />
        <button
          onClick={() => setPaletteOpen(true)}
          className={cn(
            'no-drag group flex items-center gap-3 rounded-[var(--radius-sm)]',
            'border border-[var(--line)] bg-[var(--surface-2)]/60 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]',
            'px-3 py-1 text-[12px] text-[var(--fg-muted)] transition-colors',
          )}
        >
          <span className="opacity-80">What should Hermes do?</span>
          <Kbd>⌘⇧␣</Kbd>
        </button>
      </div>
      <div className="no-drag flex items-center gap-4">
        <ProfilePicker />
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
          <Dot tone={tone} pulse={sidecar.state !== 'ready'} />
          {label}
        </div>
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)]/60 p-0.5">
          {(
            [
              { v: 'light' as const, Icon: Sun, label: 'Light' },
              { v: 'system' as const, Icon: Monitor, label: 'System' },
              { v: 'dark' as const, Icon: Moon, label: 'Dark' },
            ]
          ).map(({ v, Icon, label }) => (
            <button
              key={v}
              onClick={() => setTheme(v)}
              title={label}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                theme === v
                  ? 'bg-[var(--surface)] text-[var(--fg)] shadow-[var(--shadow-sm)]'
                  : 'text-[var(--fg-dim)] hover:text-[var(--fg)]',
              )}
            >
              <Icon className="h-3 w-3" />
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
