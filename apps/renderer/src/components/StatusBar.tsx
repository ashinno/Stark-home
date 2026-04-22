import { useSession } from '../stores/session';

export function StatusBar() {
  const sidecar = useSession((s) => s.sidecar);
  const codex = useSession((s) => s.codex);
  const provider = useSession((s) => s.activeProvider);
  const mode = useSession((s) => s.setupMode);
  const safety = useSession((s) => s.safetyPreset);

  const bridge =
    sidecar.state === 'ready'
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
    <footer className="font-mono flex h-6 shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--bg-raised)]/80 px-4 text-[10px] uppercase tracking-[0.18em] text-[var(--fg-ghost)]">
      <div className="flex items-center gap-4">
        <span>mode · {mode}</span>
        <span>·</span>
        <span>safety · {safety}</span>
        <span>·</span>
        <span>provider · {provider}</span>
        <span>·</span>
        <span>{codexLabel}</span>
      </div>
      <span>{bridge}</span>
    </footer>
  );
}
