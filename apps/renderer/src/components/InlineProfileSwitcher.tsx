import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronUp, Circle, Cpu } from 'lucide-react';
import { call } from '../lib/rpc';
import { useSession } from '../stores/session';
import { cn } from '../lib/cn';
import type { Profile, ProfilesResponse } from '@shared/rpc';

/**
 * Compact profile/model switcher designed to live inside the chat composer
 * footer. Unlike the titlebar ``ProfilePicker`` which drops down, this one
 * opens *upward* so it doesn't collide with the composer bar itself.
 *
 * We intentionally re-fetch ``/profiles`` on open (instead of caching across
 * mounts) so the user always sees the latest gateway-running status before
 * they pick. The fetch is cheap (local CLI call) and debounced by the modal
 * open state.
 */
export function InlineProfileSwitcher() {
  const active = useSession((s) => s.activeProfile);
  const setActive = useSession((s) => s.setActiveProfile);

  const [resp, setResp] = useState<ProfilesResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  async function load() {
    const r = await call<ProfilesResponse>({ method: 'GET', path: '/profiles' });
    if (r.ok && r.data) setResp(r.data);
  }

  // Lazy-load on first open so the component doesn't spam /profiles at every
  // render of the ThreadsPane.
  useEffect(() => {
    if (open && !resp) void load();
  }, [open, resp]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !popRef.current?.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function pick(id: string) {
    setBusy(id);
    const r = await call<{ active: string }>({
      method: 'POST',
      path: '/profiles/use',
      body: { id },
    });
    if (r.ok) {
      // Mirror in the settings store so the rest of the app (sidebar,
      // titlebar) stays in sync.
      await call({ method: 'PATCH', path: '/settings', body: { active_profile: id } });
      setActive(id);
    }
    setBusy(null);
    setOpen(false);
  }

  const profiles = resp?.profiles ?? [];
  const current = useMemo(
    () => profiles.find((p) => p.id === active) ?? profiles[0] ?? null,
    [profiles, active],
  );

  // Hermes CLI not installed → don't render the switcher. The chat still works
  // (it falls back to the built-in ACP bridge); we just don't have profiles
  // to switch between.
  if (resp && !resp.available) return null;

  const label = current ? `${current.name} · ${current.model || current.provider}` : 'profile';

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'group/inline flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-1 text-[11px] transition-colors',
          'border-[var(--line)] bg-[var(--surface-2)]/60 text-[var(--fg-muted)]',
          'hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]',
        )}
        title={current ? `Profile · ${current.name} (${current.model})` : 'Pick a profile'}
      >
        <Cpu className="h-3 w-3 shrink-0" />
        <span className="font-mono max-w-[220px] truncate uppercase tracking-[0.14em]">
          {label}
        </span>
        <ChevronUp
          className={cn(
            'h-3 w-3 shrink-0 transition-transform',
            open ? 'rotate-0' : 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          ref={popRef}
          className={cn(
            'absolute bottom-full right-0 z-[80] mb-2 w-[340px] overflow-hidden rounded-[var(--radius-md)] border',
            'border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)] anim-in-scale',
          )}
        >
          <div className="border-b border-[var(--line)] px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
              Switch profile · this thread
            </div>
          </div>
          <div className="max-h-[48vh] overflow-y-auto py-1">
            {!resp && (
              <div className="px-3 py-4 text-center text-[12px] text-[var(--fg-muted)]">
                Loading…
              </div>
            )}
            {resp && profiles.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-[var(--fg-muted)]">
                No profiles found. Run{' '}
                <span className="font-mono">hermes profile create</span> to add one.
              </div>
            )}
            {profiles.map((p) => (
              <InlineRow
                key={p.id}
                profile={p}
                active={p.id === active}
                busy={busy === p.id}
                onPick={() => pick(p.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InlineRow({
  profile,
  active,
  busy,
  onPick,
}: {
  profile: Profile;
  active: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const gatewayOk = profile.gateway?.toLowerCase() === 'running';
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      className={cn(
        'mx-1.5 flex w-[calc(100%-0.75rem)] items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors',
        active
          ? 'bg-[var(--primary-wash)] ring-1 ring-[var(--primary)]/30'
          : 'hover:bg-[var(--surface-2)]',
      )}
    >
      <Circle
        className={cn(
          'mt-1 h-1.5 w-1.5 shrink-0',
          gatewayOk
            ? 'fill-[var(--ok)] text-[var(--ok)]'
            : 'fill-[var(--fg-ghost)] text-[var(--fg-ghost)]',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium text-[var(--fg)]">
            {profile.name}
          </span>
          {profile.is_default && (
            <span className="font-mono rounded bg-[var(--accent-signal-wash)] px-1 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--accent-signal)]">
              default
            </span>
          )}
        </div>
        <div className="font-mono mt-0.5 truncate text-[10.5px] text-[var(--fg-muted)]">
          {profile.model || '—'} · {profile.provider || 'unknown'}
        </div>
      </div>
      {active && <Check className="mt-1 h-3 w-3 shrink-0 text-[var(--primary)]" />}
    </button>
  );
}
