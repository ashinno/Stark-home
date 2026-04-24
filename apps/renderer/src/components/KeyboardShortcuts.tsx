import { Dialog } from './ui/Dialog';
import { Kbd } from './ui/Atoms';

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; items: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: 'Navigation',
    items: [
      { keys: ['⌘', '1'], label: 'Home' },
      { keys: ['⌘', '2'], label: 'Threads' },
      { keys: ['⌘', '3'], label: 'Tools' },
      { keys: ['⌘', '4'], label: 'Skills' },
      { keys: ['⌘', '5'], label: 'Automations' },
      { keys: ['⌘', '6'], label: 'Memory' },
      { keys: ['⌘', '7'], label: 'Gateways' },
      { keys: ['⌘', '8'], label: 'Activity' },
      { keys: ['⌘', '9'], label: 'System' },
      { keys: ['⌘', ','], label: 'Settings' },
    ],
  },
  {
    title: 'System',
    items: [
      { keys: ['⌘', 'K'], label: 'Open command palette' },
      { keys: ['⌘', '⇧', '␣'], label: 'Quick prompt (from title bar)' },
      { keys: ['?'], label: 'Show this panel' },
      { keys: ['Esc'], label: 'Close dialogs & overlays' },
    ],
  },
  {
    title: 'Chat',
    items: [
      { keys: ['↵'], label: 'Send message' },
      { keys: ['⇧', '↵'], label: 'New line' },
      { keys: ['/'], label: 'Slash commands (new, remember, brief, stop)' },
    ],
  },
];

export function KeyboardShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Keyboard shortcuts"
      description="Everything Stark can do from the keyboard."
    >
      <div className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="font-mono mb-3 text-[10px] uppercase tracking-[0.22em] text-[var(--fg-ghost)]">
              {g.title}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-4 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors duration-[var(--motion-dur-xs)] hover:bg-[var(--surface-2)]/60"
                >
                  <span className="text-[13px] text-[var(--fg-muted)]">{s.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k, j) => (
                      <Kbd key={j}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-7 flex items-center justify-between border-t border-[var(--line)] pt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
        <span>Press <Kbd>?</Kbd> anytime to reopen</span>
        <span>Close with <Kbd>Esc</Kbd></span>
      </div>
    </Dialog>
  );
}
