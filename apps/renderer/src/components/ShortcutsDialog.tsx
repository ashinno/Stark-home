import { useEffect, useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Kbd } from './ui/Atoms';

type Group = { title: string; rows: { keys: string[]; label: string }[] };

const GROUPS: Group[] = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['⌘', '1'], label: 'Home' },
      { keys: ['⌘', '2'], label: 'Threads' },
      { keys: ['⌘', '3'], label: 'Tools' },
      { keys: ['⌘', '4'], label: 'Skills' },
      { keys: ['⌘', '5'], label: 'Automations' },
      { keys: ['⌘', '6'], label: 'Memory' },
      { keys: ['⌘', '7'], label: 'Gateways' },
      { keys: ['⌘', '8'], label: 'Activity' },
      { keys: ['⌘', ','], label: 'Settings' },
    ],
  },
  {
    title: 'Thread',
    rows: [
      { keys: ['⌘', 'N'], label: 'New thread' },
      { keys: ['⌘', '/'], label: 'Focus thread search' },
      { keys: ['Esc'], label: 'Stop current turn · clear composer' },
      { keys: ['⌘', '⇧', 'C'], label: 'Copy thread as markdown' },
      { keys: ['⌘', '⇧', 'E'], label: 'Export thread as .md' },
      { keys: ['⌘', '↑'], label: 'Focus composer' },
      { keys: ['↵'], label: 'Send message' },
      { keys: ['⇧', '↵'], label: 'New line in composer' },
    ],
  },
  {
    title: 'Help',
    rows: [{ keys: ['⌘', '?'], label: 'Show this list' }],
  },
];

/**
 * Global shortcuts cheatsheet, opened via ⌘? or the Help menu.
 *
 * We listen to a custom `stark:shortcuts` event so any component can trigger
 * it without prop-drilling or a store slice.
 */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('stark:shortcuts', handler as EventListener);
    return () => window.removeEventListener('stark:shortcuts', handler as EventListener);
  }, []);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="Everything you can do without reaching for the mouse."
      size="lg"
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="min-w-0">
            <div className="font-mono mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
              {g.title}
            </div>
            <ul className="space-y-1.5">
              {g.rows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-1 py-1 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0 truncate text-[var(--fg)]">{r.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
