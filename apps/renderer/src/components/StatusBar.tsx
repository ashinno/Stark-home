import { useSession } from '../stores/session';
import { Dot } from './ui/Atoms';
import { cn } from '../lib/cn';

export function StatusBar() {
  const sidecar = useSession((s) => s.sidecar);
  const codex = useSession((s) => s.codex);
  const provider = useSession((s) => s.activeProvider);
  const profile = useSession((s) => s.activeProfile);
  const mode = useSession((s) => s.setupMode);
  const safety = useSession((s) => s.safetyPreset);

  const ready = sidecar.state === 'ready';
  const bridgeTone = ready ? 'ok' : sidecar.state === 'error' ? 'bad' : 'warn';
  const bridgeLabel =
    ready && 'port' in sidecar
      ? `bridge · ${sidecar.port}`
      : sidecar.state === 'starting'
        ? 'bridge · starting'
        : sidecar.state === 'error'
          ? 'bridge · offline'
          : 'bridge · sleeping';

  const codexLabel = codex?.installed
    ? codex.signedIn
      ? 'chatgpt · linked'
      : 'chatgpt · detected'
    : 'chatgpt · none';

  return (
    <footer
      className={cn(
        'font-mono flex h-6 shrink-0 items-center justify-between border-t border-[var(--line)]',
        'bg-[var(--bg-raised)]/80 px-4 text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]',
      )}
    >
      <div className="flex items-center gap-3">
        <Group>
          <Cell>mode · {mode}</Cell>
          <Sep />
          <Cell>safety · {safety}</Cell>
        </Group>
        <VSep />
        <Group>
          <Cell>provider · {provider}</Cell>
          {profile && (
            <>
              <Sep />
              <Cell>profile · {profile}</Cell>
            </>
          )}
          <Sep />
          <Cell>{codexLabel}</Cell>
        </Group>
      </div>
      <div key={bridgeLabel} className="anim-in flex items-center gap-1.5">
        <Dot tone={bridgeTone} pulse={!ready} />
        <span>{bridgeLabel}</span>
      </div>
    </footer>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}
function Cell({ children }: { children: React.ReactNode }) {
  return <span>{children}</span>;
}
function Sep() {
  return <span className="text-[var(--fg-ghost)]/50">·</span>;
}
function VSep() {
  return <span className="h-3 w-px bg-[var(--line)]" />;
}
