import { Sun, Moon, Monitor, Home } from 'lucide-react';
import { Wordmark } from './Logo';
import { Dot, Kbd } from './ui/Atoms';
import { useSession } from '../stores/session';
import { useTheme } from '../stores/theme';
import { cn } from '../lib/cn';
import { ProfilePicker } from './ProfilePicker';

export function TitleBar() {
  const sidecar = useSession((s) => s.sidecar);
  const setPaletteOpen = useSession((s) => s.setPaletteOpen);
  const homeMode = useSession((s) => s.homeMode);
  const setHomeMode = useSession((s) => s.setHomeMode);
  const setRoute = useSession((s) => s.setRoute);
  const { theme, setTheme } = useTheme();

  const onToggleHomeMode = () => {
    // Turning home mode on only makes sense from the Home route.
    if (!homeMode) setRoute('home');
    setHomeMode(!homeMode);
  };

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
            'px-3 py-1 text-[12px] text-[var(--fg-muted)]',
            'transition-[background-color,border-color,color] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
            'hover:text-[var(--fg)]',
            'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
          )}
        >
          <span className="opacity-80">What should Stark do?</span>
          <Kbd>⌘⇧␣</Kbd>
        </button>
      </div>
      <div className="no-drag flex items-center gap-4">
        <button
          onClick={onToggleHomeMode}
          role="switch"
          aria-checked={homeMode}
          aria-label="Home mode"
          title={homeMode ? 'Home mode is on — switch off to return to the compact view' : 'Home mode is off — switch on for the fullscreen house + floating chat'}
          className="font-mono no-drag group flex items-center gap-2 rounded-[var(--radius-sm)] border border-transparent px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors hover:border-[var(--line)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <Home
            className={cn(
              'h-3 w-3 transition-colors',
              homeMode ? 'text-[var(--primary)]' : 'text-[var(--fg-dim)] group-hover:text-[var(--fg-muted)]',
            )}
          />
          <span className={cn('transition-colors', homeMode ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]')}>
            home mode
          </span>
          <span
            aria-hidden
            className={cn(
              'inline-flex h-4 w-8 shrink-0 items-center rounded-full p-0.5',
              'transition-[background-color,box-shadow] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
              homeMode
                ? 'bg-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_12px_-3px_var(--primary-glow)]'
                : 'bg-[var(--surface-3)] shadow-[inset_0_0_0_1px_var(--line)]',
            )}
          >
            <span
              className={cn(
                'block h-3 w-3 rounded-full',
                'shadow-[0_1px_2px_rgba(0,0,0,0.35),inset_0_-1px_0_rgba(0,0,0,0.08)]',
                'transition-[transform,background-color] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-spring)]',
                homeMode
                  ? 'translate-x-[16px] bg-[var(--primary-ink)]'
                  : 'translate-x-0 bg-white',
              )}
            />
          </span>
        </button>
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
              aria-label={`${label} theme`}
              aria-pressed={theme === v}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full',
                'transition-[background-color,color,box-shadow] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
                'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
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
