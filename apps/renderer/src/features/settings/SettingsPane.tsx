import { useEffect, useState } from 'react';
import {
  Stethoscope,
  Users,
  Cpu,
  Radio,
  Server,
  Plug,
  Palette,
  Check,
  Loader2,
  AlertTriangle,
  X,
  Flame,
  Monitor,
  Sun,
  Moon,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { SectionHeading, Badge, Dot } from '../../components/ui/Atoms';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Input';
import { TabStrip, type Tab as TabDef } from '../../components/ui/TabStrip';
import { useToast } from '../../components/ui/Toast';
import { useSession } from '../../stores/session';
import { useTheme } from '../../stores/theme';
import { call } from '../../lib/rpc';
import { Logo } from '../../components/Logo';
import { ProfilePicker } from '../../components/ProfilePicker';
import { McpGalleryTab } from './McpGalleryTab';
import type { DoctorCheck } from '@shared/rpc';
import { cn } from '../../lib/cn';

type Tab = 'doctor' | 'profiles' | 'providers' | 'gateways' | 'backends' | 'mcp' | 'account';

const SETTINGS_TABS: readonly TabDef<Tab>[] = [
  { id: 'doctor', label: 'Hermes Doctor', icon: Stethoscope },
  { id: 'profiles', label: 'Profiles', icon: Users },
  { id: 'providers', label: 'Providers', icon: Cpu },
  { id: 'gateways', label: 'Gateways', icon: Radio },
  { id: 'backends', label: 'Backends', icon: Server },
  { id: 'mcp', label: 'MCP', icon: Plug },
  { id: 'account', label: 'Account & Theme', icon: Palette },
];

export function SettingsPane() {
  const [tab, setTab] = useState<Tab>('doctor');

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-8 py-5">
        <SectionHeading
          eyebrow="Settings"
          stamp="sheet 09 · configuration"
          title="Make Stark yours"
          description="Everything the control center needs: health, providers, gateways, backends, MCP, and account."
        />
      </div>
      <div className="border-b border-[var(--line)] px-8">
        <TabStrip tabs={SETTINGS_TABS} active={tab} onSelect={setTab} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {tab === 'doctor' && <DoctorTab />}
          {tab === 'profiles' && <ProfilePicker size="full" />}
          {tab === 'providers' && <ProvidersTab />}
          {tab === 'gateways' && <GatewaysTab />}
          {tab === 'backends' && <BackendsTab />}
          {tab === 'mcp' && <MCPTab />}
          {tab === 'account' && <AccountTab />}
        </div>
      </div>
    </div>
  );
}

// ───────────── Hermes Doctor

function DoctorTab() {
  const [checks, setChecks] = useState<DoctorCheck[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const r = await call<{ checks: DoctorCheck[] }>({ method: 'POST', path: '/doctor/run' });
    if (r.ok && r.data) setChecks(r.data.checks);
    setRunning(false);
  }
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ok = checks.filter((c) => c.state === 'ok').length;
  const warn = checks.filter((c) => c.state === 'warn').length;
  const fail = checks.filter((c) => c.state === 'fail').length;

  return (
    <div>
      <Card>
        <div className="flex items-center justify-between p-6">
          <div>
            <h3 className="font-display text-2xl">Health check</h3>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              We run these every time you open Settings. Also triggered from the tray.
            </p>
            <div className="mt-3 flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.16em]">
              <span className="text-[var(--ok)]">{ok} ok</span>
              <span className="text-[var(--fg-ghost)]">·</span>
              <span className="text-[var(--warn)]">{warn} warn</span>
              <span className="text-[var(--fg-ghost)]">·</span>
              <span className="text-[var(--bad)]">{fail} fail</span>
            </div>
          </div>
          <Button variant="primary" loading={running} onClick={run}>
            Run again
          </Button>
        </div>
        <div className="border-t border-[var(--line)]">
          <ul className="divide-y divide-[var(--line)]">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-6 py-3">
                <CheckDot state={c.state} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{c.label}</div>
                  {c.note && (
                    <div className="font-mono mt-0.5 text-[11px] text-[var(--fg-muted)]">{c.note}</div>
                  )}
                </div>
                <StateBadge state={c.state} />
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function CheckDot({ state }: { state: DoctorCheck['state'] }) {
  if (state === 'pending')
    return <Loader2 className="mt-1 h-3.5 w-3.5 animate-[stark-spin_0.8s_linear_infinite] text-[var(--fg-dim)]" />;
  if (state === 'ok') return <Check className="mt-1 h-3.5 w-3.5 text-[var(--ok)]" />;
  if (state === 'warn') return <AlertTriangle className="mt-1 h-3.5 w-3.5 text-[var(--warn)]" />;
  return <X className="mt-1 h-3.5 w-3.5 text-[var(--bad)]" />;
}

function StateBadge({ state }: { state: DoctorCheck['state'] }) {
  if (state === 'ok') return <Badge tone="ok">ok</Badge>;
  if (state === 'warn') return <Badge tone="warn">warn</Badge>;
  if (state === 'fail') return <Badge tone="bad">fail</Badge>;
  return <Badge>pending</Badge>;
}

// ───────────── Providers

type Provider = {
  id: string;
  name: string;
  kind: string;
  configured: boolean;
  model: string;
  description: string;
  key_fingerprint?: string;
};

function ProvidersTab() {
  const [items, setItems] = useState<Provider[]>([]);
  const [active, setActive] = useState<string>('');
  const setProvider = useSession((s) => s.setProvider);
  const push = useToast((s) => s.push);

  async function load() {
    const r = await call<{ providers: Provider[]; active: string }>({
      method: 'GET',
      path: '/providers',
    });
    if (r.ok && r.data) {
      setItems(r.data.providers);
      setActive(r.data.active);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function activate(id: string) {
    await call({ method: 'POST', path: '/providers/active', body: { id } });
    setActive(id);
    setProvider(id);
    push({ kind: 'success', title: `Using ${items.find((p) => p.id === id)?.name}` });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((p) => {
        const isActive = p.id === active;
        return (
          <Card key={p.id} glow={isActive} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {p.name}
                  {isActive && <Badge tone="primary">active</Badge>}
                </div>
                <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{p.description}</p>
                <div className="font-mono mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                  {p.configured ? (
                    <>
                      <Dot tone="ok" />
                      {p.key_fingerprint ?? 'configured'}
                    </>
                  ) : (
                    <>
                      <Dot tone="dim" />
                      not configured
                    </>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={isActive ? 'secondary' : 'primary'}
                disabled={isActive}
                onClick={() => activate(p.id)}
              >
                {isActive ? 'In use' : 'Use'}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ───────────── Gateways / Backends / MCP

function GatewaysTab() {
  return <ListWithAction resource="gateways" nameKey="name" statusKey="status" />;
}

function BackendsTab() {
  return <ListWithAction resource="backends" nameKey="name" statusKey="active" />;
}

function MCPTab() {
  return <McpGalleryTab />;
}

function ListWithAction({
  resource,
  nameKey,
  statusKey,
  itemKey,
}: {
  resource: string;
  nameKey: string;
  statusKey: string;
  itemKey?: string;
}) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    void (async () => {
      const r = await call<Record<string, unknown>>({ method: 'GET', path: `/${resource}` });
      if (r.ok && r.data) {
        const key = itemKey ?? resource;
        const rows = (r.data[key] as Record<string, unknown>[]) ?? [];
        setItems(rows);
      }
    })();
  }, [resource, itemKey]);

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="py-12 text-center text-sm text-[var(--fg-muted)]">None configured yet.</div>
      )}
      {items.map((it) => {
        const status = it[statusKey];
        const tone =
          status === true || status === 'online'
            ? 'ok'
            : status === 'misconfigured' || status === 'failed'
              ? 'warn'
              : 'neutral';
        return (
          <Card key={String(it.id ?? it[nameKey])} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Dot tone={tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'dim'} />
              <div>
                <div className="text-sm font-medium">{String(it[nameKey])}</div>
                <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg-ghost)]">
                  {typeof status === 'boolean' ? (status ? 'enabled' : 'disabled') : String(status)}
                </div>
              </div>
            </div>
            <Button size="sm" variant="ghost">
              Configure
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

// ───────────── Account & Theme

function AccountTab() {
  const codex = useSession((s) => s.codex);
  const setCodex = useSession((s) => s.setCodex);
  const userName = useSession((s) => s.userName);
  const setUserName = useSession((s) => s.setUserName);
  const setOnboarded = useSession((s) => s.setOnboarded);

  const { theme, setTheme } = useTheme();
  const [info, setInfo] = useState<{ name: string; version: string; platform: string; arch: string } | null>(null);
  const [draft, setDraft] = useState(userName);
  const push = useToast((s) => s.push);

  useEffect(() => setDraft(userName), [userName]);
  useEffect(() => {
    void window.stark.appInfo().then(setInfo);
  }, []);

  async function refreshCodex() {
    const s = await window.stark.codex.detect();
    setCodex(s);
  }

  async function saveName() {
    await call({ method: 'PATCH', path: '/settings', body: { user_name: draft } });
    setUserName(draft);
    push({ kind: 'success', title: 'Saved' });
  }

  return (
    <div className="space-y-4">
      {/* Codex sign-in */}
      <Card>
        <div className="flex items-start gap-4 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-wash)] text-[var(--primary)]">
            <Flame className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xl">ChatGPT sign-in</h3>
              {codex?.installed && codex.signedIn && <Badge tone="ok">connected</Badge>}
            </div>
            <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
              Optional. Route chat through the local Codex CLI so your ChatGPT Plus/Pro subscription covers it.
            </p>
            {codex?.installed ? (
              <div className="mt-4 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Dot tone={codex.signedIn ? 'ok' : 'primary'} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                    codex · {codex.version}
                  </span>
                  {codex.signedIn && codex.account && (
                    <span className="ml-3 text-[var(--fg)]">{codex.account}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!codex.signedIn ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={async () => {
                        await window.stark.codex.signIn();
                        setTimeout(refreshCodex, 1500);
                      }}
                    >
                      Sign in
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await window.stark.codex.signOut();
                        await refreshCodex();
                      }}
                    >
                      Sign out
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={refreshCodex}>
                    Refresh
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex items-start gap-2 text-sm">
                  <TerminalIcon className="mt-0.5 h-4 w-4 text-[var(--fg-dim)]" />
                  <div className="flex-1">
                    <p className="text-[var(--fg-muted)]">Codex CLI is not installed. Install with npm:</p>
                    <code className="font-mono mt-2 block rounded-[var(--radius-sm)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--primary)]">
                      npm install -g @openai/codex
                    </code>
                  </div>
                </div>
                <div className="mt-3 text-right">
                  <Button variant="ghost" size="sm" onClick={refreshCodex}>
                    I've installed it
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Name + theme */}
      <Card>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <Field label="Your name" hint="How Stark addresses you">
            <div className="flex gap-2">
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="—" />
              <Button variant="secondary" onClick={saveName} disabled={draft === userName}>
                Save
              </Button>
            </div>
          </Field>
          <Field label="Appearance" hint="Matches macOS if System">
            <div className="flex gap-2">
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
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm transition-colors',
                    theme === v
                      ? 'border-[var(--primary)] bg-[var(--primary-wash)] text-[var(--primary)]'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--fg-muted)]',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      {/* About */}
      <Card>
        <div className="flex items-center gap-4 p-6">
          <Logo size={40} />
          <div className="flex-1">
            <h3 className="font-display text-xl">Stark</h3>
            {info && (
              <p className="font-mono mt-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--fg-ghost)]">
                v{info.version} · {info.platform} {info.arch}
              </p>
            )}
            <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
              A native Mac control center for the MIT-licensed <span className="italic">hermes-agent</span> by Nous Research.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOnboarded(false)}>
            Re-run onboarding
          </Button>
        </div>
      </Card>
    </div>
  );
}
