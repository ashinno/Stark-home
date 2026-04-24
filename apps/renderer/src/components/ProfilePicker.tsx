import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Circle, RefreshCcw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { call } from '../lib/rpc';
import { useSession } from '../stores/session';
import { Mascot } from './Mascot';
import type { Profile, ProfilesResponse } from '@shared/rpc';
import { cn } from '../lib/cn';

/**
 * Profile picker — lists the local profiles detected on this Mac and lets
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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
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

  useLayoutEffect(() => {
    if (!open || size !== 'compact') return;
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 24);
      const left =
        align === 'right'
          ? Math.max(12, rect.right - width)
          : Math.min(rect.left, window.innerWidth - width - 12);
      setMenuStyle({
        position: 'fixed',
        top: Math.min(rect.bottom + 12, window.innerHeight - 24),
        left,
        width,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, open, size]);

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

  // Engine CLI isn't installed → hide the picker entirely.
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
          'no-drag flex h-10 w-[220px] items-center gap-2.5 rounded-[14px] border px-2.5',
          'border-[#34395f] bg-[#171a29]/96 shadow-[0_12px_24px_rgba(4,6,16,0.26),inset_0_1px_0_rgba(255,255,255,0.04)]',
          'transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
          'hover:border-[#49539a] hover:bg-[#1b1f31] hover:shadow-[0_14px_26px_rgba(4,6,16,0.32),inset_0_1px_0_rgba(255,255,255,0.05)]',
          open && 'border-[#657cff] bg-[#1b1f31] shadow-[0_16px_30px_rgba(4,6,16,0.34),0_0_0_1px_rgba(101,124,255,0.16)]',
        )}
        title={current ? `Profile: ${current.name} · ${current.model}` : 'Profile'}
      >
        <div className="rounded-[10px] border border-[#4b5078] bg-[#f2eddd] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)]">
          <ProfileAvatar id={current?.id ?? 'default'} size={0.72} expr="happy" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-[12px] font-semibold tracking-[0.12em] text-[#f2f4ff]">
            {(current?.name ?? 'No profile').toUpperCase()}
          </div>
          <div className="truncate font-mono text-[10px] text-[#8f94b2]">
            {current ? `${current.provider}/${current.model}` : 'Select a profile'}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[#7e84aa] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            style={menuStyle}
            className={cn(
              'z-[160] overflow-hidden rounded-[18px] border anim-in-scale',
              'border-[#30365a] bg-[#171924]/98 shadow-[0_32px_80px_rgba(2,4,12,0.62),inset_0_1px_0_rgba(255,255,255,0.04)]',
            )}
          >
            <div className="flex items-center justify-between border-b border-[#2a2f4c] px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#6e7393]">
                Profiles
              </div>
              <button
                onClick={load}
                className="rounded-full p-1.5 text-[#7f85a8] transition-colors hover:bg-[#202437] hover:text-[#eff2ff]"
                title="Refresh"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-[56vh] overflow-y-auto bg-[#171924] py-2">
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
                <div className="px-5 py-7 text-center text-[12px] text-[#9499b8]">
                  No profiles found. Create one from the command line, then refresh this view.
                </div>
              )}
            </div>
          </div>,
          document.body,
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
        'mx-2 flex w-[calc(100%-1rem)] items-start gap-3 rounded-[14px] border px-3 py-3 text-left transition-[background-color,border-color,box-shadow]',
        active
          ? 'border-[#4b5fdb] bg-[#222742] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'border-transparent bg-transparent hover:border-[#2c3150] hover:bg-[#1d2132]',
      )}
    >
      <div className="mt-0.5 rounded-[12px] border border-[#4b5078] bg-[#f2eddd] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.42)]">
        <ProfileAvatar id={profile.id} size={1.35} expr={active ? 'happy' : 'idle'} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-[#f0f2ff]">{profile.name}</span>
          {profile.is_default && (
            <span className="font-mono rounded-[8px] border border-[#7b5f2d] bg-[#433015] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#f2b542]">
              default
            </span>
          )}
          {profile.has_soul && (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#707695]">
              · soul
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10.5px] text-[#a7acc8]">
          {profile.model} · {profile.provider}
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#6e7393]">
          <Circle
            className={cn(
              'h-2 w-2',
              gatewayOk
                ? 'fill-[#2fd3c6] text-[#2fd3c6]'
                : 'fill-[#6e7393] text-[#6e7393]',
            )}
          />
          <span>{profile.gateway}</span>
          {typeof profile.skills === 'number' && (
            <span className="justify-self-end">{profile.skills} skills</span>
          )}
        </div>
      </div>
      {active && <Check className="mt-1 h-4 w-4 shrink-0 text-[#8ca0ff]" />}
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
                'flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-dur-sm)] ease-[var(--motion-ease-out)]',
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
      className="inline-flex items-center justify-center overflow-hidden rounded-[8px] border border-[var(--line)] bg-[#EEF3FF]"
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
