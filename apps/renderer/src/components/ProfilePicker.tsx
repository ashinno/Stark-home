import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Circle, RefreshCcw } from 'lucide-react';
import { call } from '../lib/rpc';
import { useSession } from '../stores/session';
import { Mascot } from './Mascot';
import type { Profile, ProfilesResponse } from '@shared/rpc';
import { cn } from '../lib/cn';

/**
 * Profile picker — lists the Hermes profiles detected on this Mac and lets
 * the user pick which one to talk to. Each profile gets its own cute Stark
 * avatar (tinted by a hash of the profile name so "akita" and "stark" feel
 * distinct at a glance).
 *
 * size='compact' fits the title bar; size='full' renders a full card grid.
 */
export function ProfilePicker({
  size = 'compact',
  align = 'right',
}: {
  size?: 'compact' | 'full';
  align?: 'left' | 'right';
}) {
  const active = useSession((s) => s.activeProfile);
  const setActive = useSession((s) => s.setActiveProfile);
  const [resp, setResp] = useState<ProfilesResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  async function load() {
    const r = await call<ProfilesResponse>({ method: 'GET', path: '/profiles' });
    if (r.ok && r.data) {
      setResp(r.data);
      // Seed active if we don't have one yet.
      if (!active && r.data.active) {
        setActive(r.data.active);
      }
    }
  }

  useEffect(() => {
    void load();
    // Re-check every minute so gateway-running status stays fresh.
    const i = window.setInterval(load, 60_000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await call({
        method: 'PATCH',
        path: '/settings',
        body: { active_profile: id },
      });
      setActive(id);
    }
    setBusy(null);
    setOpen(false);
  }

  const profiles = resp?.profiles ?? [];
  const current = profiles.find((p) => p.id === active) ?? profiles[0];

  // Hermes CLI isn't installed → hide the picker entirely.
  if (resp && !resp.available) return null;

  if (size === 'full') {
    return (
      <FullGrid
        profiles={profiles}
        active={active}
        busy={busy}
        onPick={pick}
        onRefresh={load}
      />
    );
  }

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'no-drag flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)]',
          'bg-[var(--surface-2)]/70 px-2 py-1 text-[11px] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]',
          'transition-colors',
        )}
        title={current ? `Profile: ${current.name}` : 'Profile'}
      >
        <ProfileAvatar id={current?.id ?? 'default'} size={1} expr="happy" />
        <span className="font-mono uppercase tracking-[0.14em] text-[var(--fg)]">
          {current?.name ?? 'no profile'}
        </span>
        <span className="hidden text-[10px] text-[var(--fg-ghost)] md:inline">
          · {current?.model}
        </span>
        <ChevronDown className="h-3 w-3 text-[var(--fg-dim)]" />
      </button>

      {open && (
        <div
          ref={popRef}
          className={cn(
            'absolute top-full z-50 mt-2 w-80 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]',
            'bg-[var(--surface)] shadow-[var(--shadow-lg)] anim-in-scale',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--fg-ghost)]">
              Hermes profiles
            </div>
            <button
              onClick={load}
              className="text-[var(--fg-dim)] hover:text-[var(--fg)]"
              title="Refresh"
            >
              <RefreshCcw className="h-3 w-3" />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {profiles.map((p) => (
              <ProfileRow
                key={p.id}
                profile={p}
                active={p.id === active}
                busy={busy === p.id}
                onPick={() => pick(p.id)}
              />
            ))}
            {profiles.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-[var(--fg-muted)]">
                No profiles found. Run <span className="font-mono">hermes profile create</span> to add one.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileRow({
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
      onClick={onPick}
      disabled={busy}
      className={cn(
        'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors',
        active ? 'bg-[var(--primary-wash)]' : 'hover:bg-[var(--surface-2)]',
      )}
    >
      <div className="mt-0.5">
        <ProfileAvatar id={profile.id} size={2} expr={active ? 'happy' : 'idle'} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{profile.name}</span>
          {profile.is_default && (
            <span className="font-mono rounded bg-[var(--accent-signal-wash)] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--accent-signal)]">
              default
            </span>
          )}
          {profile.has_soul && (
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
              · soul
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[var(--fg-muted)]">
          <span className="font-mono">{profile.model}</span>
          <span className="text-[var(--fg-ghost)]">·</span>
          <span className="font-mono">{profile.provider}</span>
        </div>
        <div className="font-mono mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
          <Circle
            className={cn('h-2 w-2', gatewayOk ? 'fill-[var(--ok)] text-[var(--ok)]' : 'fill-[var(--fg-ghost)] text-[var(--fg-ghost)]')}
          />
          gateway · {profile.gateway}
          <span>·</span>
          <span>
            {typeof profile.skills === 'number' ? `${profile.skills} skills` : 'skills —'}
          </span>
        </div>
      </div>
      {active && <Check className="mt-2 h-4 w-4 text-[var(--primary)]" />}
    </button>
  );
}

function FullGrid({
  profiles,
  active,
  busy,
  onPick,
  onRefresh,
}: {
  profiles: Profile[];
  active: string | null;
  busy: string | null;
  onPick: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-xl">Profiles on this Mac</h3>
        <button
          onClick={onRefresh}
          className="font-mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          <RefreshCcw className="h-3 w-3" /> refresh
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => {
          const isActive = p.id === active;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              disabled={busy === p.id}
              className={cn(
                'flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-all',
                isActive
                  ? 'border-[var(--primary)] bg-[var(--primary-wash)]'
                  : 'border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]',
              )}
            >
              <ProfileAvatar id={p.id} size={2} expr={isActive ? 'happy' : 'idle'} accessory={isActive ? 'wings' : 'none'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.is_default && (
                    <span className="font-mono rounded bg-[var(--accent-signal-wash)] px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--accent-signal)]">
                      default
                    </span>
                  )}
                </div>
                <div className="font-mono mt-1 text-[11px] text-[var(--fg-muted)]">
                  {p.model}
                </div>
                <div className="font-mono mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--fg-ghost)]">
                  {p.provider} · {p.gateway}
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 text-[var(--primary)]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tint Stark's body by a hash of the profile name so profiles feel visually distinct. */
function ProfileAvatar({
  id,
  size,
  expr = 'idle',
  accessory = 'none',
}: {
  id: string;
  size: number;
  expr?: 'idle' | 'happy' | 'thinking';
  accessory?: 'none' | 'wings';
}) {
  const hex = hashToHex(id);
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-[var(--radius-xs)] border-2 border-[#1C2340] bg-[#F4EEDF]"
      style={{ width: 32 * size, height: 32 * size }}
    >
      <Mascot scale={size} expr={expr} pose="idle" accessory={accessory} bodyColor={hex} />
    </span>
  );
}

const PALETTE = ['#1C2340', '#2B4F6B', '#4B3A6E', '#5A3A2E', '#2E5A3A', '#603F3F'];

function hashToHex(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
