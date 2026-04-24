import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  MessagesSquare,
  CalendarClock,
  Wrench,
  Sparkles,
  Home as HomeIcon,
  Settings as Cog,
  Play,
  Search,
  Zap,
  Keyboard,
  ServerCog,
} from 'lucide-react';
import { useSession, type Route } from '../stores/session';
import { Kbd } from './ui/Atoms';
import { Presence } from './ui/Presence';
import { cn } from '../lib/cn';

type Command = {
  id: string;
  title: string;
  subtitle?: string;
  group: 'Ask Stark' | 'Navigate' | 'Run';
  icon: typeof HomeIcon;
  run: () => void;
  keywords?: string;
};

/**
 * Global command palette — the answer to "What should Stark do?"
 *
 * Three groups:
 *   • Ask Stark — turn the query into a thread prompt
 *   • Navigate   — jump to any top-level area
 *   • Run        — shortcuts for common agent tasks
 */
export function CommandPalette({ onShowShortcuts }: { onShowShortcuts?: () => void } = {}) {
  const open = useSession((s) => s.paletteOpen);
  const setOpen = useSession((s) => s.setPaletteOpen);
  const setRoute = useSession((s) => s.setRoute);
  const appendMessage = useSession((s) => s.appendMessage);
  const resetThread = useSession((s) => s.resetThread);

  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const navigate = (r: Route) => {
    setRoute(r);
    setOpen(false);
  };

  const sendPrompt = (text: string) => {
    resetThread();
    appendMessage({
      id: `u${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    });
    navigate('threads');
  };

  const commands: Command[] = useMemo(() => {
    const ask: Command[] = q.trim()
      ? [
          {
            id: 'ask',
            title: q,
            subtitle: 'Send as a prompt',
            group: 'Ask Stark',
            icon: ArrowUpRight,
            run: () => sendPrompt(q),
          },
        ]
      : [];
    const nav: Command[] = [
      { id: 'go-home', title: 'Home', group: 'Navigate', icon: HomeIcon, run: () => navigate('home'), keywords: 'dashboard recents approvals' },
      { id: 'go-threads', title: 'Threads', group: 'Navigate', icon: MessagesSquare, run: () => navigate('threads'), keywords: 'chat conversation' },
      { id: 'go-tools', title: 'Tools', group: 'Navigate', icon: Wrench, run: () => navigate('tools'), keywords: 'files terminal browser web memory permissions' },
      { id: 'go-skills', title: 'Skills', group: 'Navigate', icon: Sparkles, run: () => navigate('skills') },
      { id: 'go-autos', title: 'Automations', group: 'Navigate', icon: CalendarClock, run: () => navigate('automations'), keywords: 'cron jobs schedule' },
      { id: 'go-system', title: 'System', group: 'Navigate', icon: ServerCog, run: () => navigate('system'), keywords: 'analytics logs keys config env gateway status' },
      { id: 'go-settings', title: 'Settings', group: 'Navigate', icon: Cog, run: () => navigate('settings'), keywords: 'providers doctor theme' },
    ];
    const run: Command[] = [
      { id: 'r-brief', title: 'Run morning brief', subtitle: 'Summary of yesterday + today', group: 'Run', icon: Play, run: () => sendPrompt('Run my morning brief') },
      { id: 'r-downloads', title: 'Analyze my Downloads folder', group: 'Run', icon: Search, run: () => sendPrompt('Analyze the files in my Downloads folder and summarize by type.') },
      { id: 'r-doctor', title: 'Open System Doctor', group: 'Run', icon: Zap, run: () => navigate('settings') },
      { id: 'r-folder', title: 'Summarize current folder', group: 'Run', icon: Search, run: () => sendPrompt('Summarize what is in my current working folder.') },
      ...(onShowShortcuts
        ? [{
            id: 'r-shortcuts',
            title: 'Keyboard shortcuts',
            subtitle: 'Show the cheat sheet',
            group: 'Run' as const,
            icon: Keyboard,
            keywords: 'help hotkeys bindings cheatsheet',
            run: () => {
              setOpen(false);
              onShowShortcuts();
            },
          }]
        : []),
    ];
    const all = [...ask, ...nav, ...run];
    const query = q.trim().toLowerCase();
    if (!query) return all;
    // Score so title/subtitle prefix matches rank above keyword substring hits
    // — otherwise "mem" for Memory can rank behind Tools (whose keywords list
    // contains "memory").
    const scored = all
      .map((c) => {
        const title = c.title.toLowerCase();
        const subtitle = (c.subtitle ?? '').toLowerCase();
        const keywords = (c.keywords ?? '').toLowerCase();
        let score = 0;
        if (title === query) score = 100;
        else if (title.startsWith(query)) score = 80;
        else if (title.includes(query)) score = 60;
        else if (subtitle.includes(query)) score = 40;
        else if (keywords.includes(query)) score = 20;
        // Ask-Stark passthrough always matches so the user can send the query.
        if (c.group === 'Ask Stark') score = Math.max(score, 1);
        return { c, score };
      })
      .filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, commands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commands[cursor]?.run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, commands, cursor]);

  let lastGroup: Command['group'] | null = null;
  return (
    <Presence when={open} variant="fade" exitMs={160}>
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-8 pt-[14vh]">
      <div className="absolute inset-0 bg-[var(--bg)]/75 backdrop-blur-md" onClick={() => setOpen(false)} />
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)] anim-in-scale"
        style={{ animationDelay: '60ms' }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4">
          <Search className="h-4 w-4 text-[var(--fg-dim)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Close on Escape even when the input has focus — some browsers
              // swallow window-level keydown for text inputs.
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
            placeholder="What should Stark do?"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--fg-ghost)]"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
          {commands.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[var(--fg-muted)]">
              No results. Try a different phrase.
            </div>
          )}
          {commands.map((c, idx) => {
            const showGroup = lastGroup !== c.group;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {showGroup && (
                  <div className="font-mono mt-2 mb-1 px-3 text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
                    {c.group}
                  </div>
                )}
                <button
                  onClick={c.run}
                  onMouseEnter={() => setCursor(idx)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left',
                    'transition-[background-color,color] duration-[var(--motion-dur-xs)] ease-[var(--motion-ease-out)]',
                    'focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]',
                    idx === cursor
                      ? 'bg-[var(--primary-wash)]'
                      : 'hover:bg-[var(--surface-2)]',
                  )}
                >
                  <c.icon
                    className={cn(
                      'h-4 w-4',
                      idx === cursor ? 'text-[var(--primary)]' : 'text-[var(--fg-dim)]',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] text-[var(--fg)]">{c.title}</div>
                    {c.subtitle && (
                      <div className="truncate text-[11.5px] text-[var(--fg-muted)]">{c.subtitle}</div>
                    )}
                  </div>
                  {idx === cursor && <Kbd>↵</Kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-2)]/60 px-4 py-2 text-[11px] text-[var(--fg-muted)]">
          <div className="flex items-center gap-2">
            <Kbd>↑↓</Kbd> navigate
            <span className="opacity-60">·</span>
            <Kbd>↵</Kbd> open
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em]">
            stark · command palette
          </div>
        </div>
      </div>
    </div>
    </Presence>
  );
}
